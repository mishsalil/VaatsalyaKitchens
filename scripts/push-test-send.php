<?php
/* Fire a test push to every subscription in the DB and report per-endpoint results.
   Run AFTER a browser has opted in (so push_subscriptions has >=1 real row):
       php scripts/push-test-send.php ["Custom title" "Custom body"]
   Safe to delete afterwards. */

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/push.php';

$cfg = config();
if (!push_configured()) {
    fwrite(STDERR, "Push not configured — set VAPID keys in includes/config.php.\n");
    exit(1);
}

$title = $argv[1] ?? '🔔 Test from Vaatsalya Kitchens';
$body  = $argv[2] ?? 'This is a test push notification from the local server.';

$rows = db()->query('SELECT * FROM push_subscriptions')->fetchAll();
$count = count($rows);
echo "Subscriptions in DB: $count\n";
if ($count === 0) {
    fwrite(STDERR, "No subscriptions yet. Opt in a device from order-success.php first.\n");
    exit(2);
}

$webPush = new Minishlink\WebPush\WebPush([
    'VAPID' => [
        'subject'   => $cfg['vapid']['subject'],
        'publicKey' => $cfg['vapid']['public_key'],
        'privateKey'=> $cfg['vapid']['private_key'],
    ],
]);
$webPush->setDefaultOptions(['TTL' => 60]);

$payload = json_encode([
    'title' => $title,
    'body'  => $body,
    'url'   => $cfg['base_url'] . '/account',
    'icon'  => $cfg['base_url'] . '/assets/icon-192.png',
], JSON_UNESCAPED_UNICODE);

foreach ($rows as $row) {
    $webPush->queueNotification(
        Minishlink\WebPush\Subscription::create([
            'endpoint' => $row['endpoint'],
            'keys'     => ['p256dh' => $row['p256dh'], 'auth' => $row['auth_key']],
        ]),
        $payload
    );
}

$sent = 0; $failed = 0;
foreach ($webPush->flush() as $report) {
    $ep = $report->getEndpoint();
    $host = parse_url($ep, PHP_URL_HOST);
    if ($report->isSuccess()) {
        $sent++;
        echo "  [OK]   $host  -> delivered\n";
    } else {
        $failed++;
        $reason = $report->getReason();
        $code = method_exists($report, 'getResponse') && $report->getResponse()
            ? $report->getResponse()->getStatusCode() : '?';
        echo "  [FAIL] $host  -> {$reason} (HTTP {$code})\n";
        if ($report->isSubscriptionExpired()) {
            db()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$ep]);
            echo "         expired subscription removed from DB.\n";
        }
    }
}
echo "\nResult: sent={$sent} failed={$failed}\n";
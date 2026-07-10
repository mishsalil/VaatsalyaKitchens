<?php
/* Web Push sending. Silently does nothing until VAPID keys are configured,
   so the rest of the app works before push is set up. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

function push_configured(): bool
{
    $v = config()['vapid'];
    return !empty($v['public_key']) && !empty($v['private_key']);
}

/**
 * Send a notification to a set of push_subscriptions rows.
 * Returns [sent, failed]. Dead subscriptions (endpoint gone) are deleted.
 */
function push_send(array $subscriptionRows, string $title, string $body, string $url = ''): array
{
    if (!push_configured() || !$subscriptionRows) {
        return [0, 0];
    }
    $cfg = config();

    $webPush = new WebPush([
        'VAPID' => [
            'subject'    => $cfg['vapid']['subject'],
            'publicKey'  => $cfg['vapid']['public_key'],
            'privateKey' => $cfg['vapid']['private_key'],
        ],
    ]);
    $webPush->setDefaultOptions(['TTL' => 3600]);

    $payload = json_encode([
        'title' => $title,
        'body'  => $body,
        'url'   => $url ?: ($cfg['base_url'] . '/my-account.php'),
        'icon'  => $cfg['base_url'] . '/assets/icon-192.png',
    ], JSON_UNESCAPED_UNICODE);

    foreach ($subscriptionRows as $row) {
        $webPush->queueNotification(Subscription::create([
            'endpoint' => $row['endpoint'],
            'keys'     => ['p256dh' => $row['p256dh'], 'auth' => $row['auth_key']],
        ]), $payload);
    }

    $sent = 0;
    $failed = 0;
    foreach ($webPush->flush() as $report) {
        if ($report->isSuccess()) {
            $sent++;
            continue;
        }
        $failed++;
        if ($report->isSubscriptionExpired()) {
            db()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
                ->execute([$report->getEndpoint()]);
        }
    }
    return [$sent, $failed];
}

function push_send_to_customer(int $customerId, string $title, string $body, string $url = ''): array
{
    $stmt = db()->prepare('SELECT * FROM push_subscriptions WHERE customer_id = ?');
    $stmt->execute([$customerId]);
    return push_send($stmt->fetchAll(), $title, $body, $url);
}

function push_send_broadcast(string $title, string $body, string $url = ''): array
{
    $rows = db()->query('SELECT * FROM push_subscriptions')->fetchAll();
    return push_send($rows, $title, $body, $url);
}

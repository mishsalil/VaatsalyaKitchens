<?php
/* Send a test FCM notification to registered Android devices.
 *
 *   php scripts/fcm-send-test.php                 — urgent alert to STAFF devices
 *   php scripts/fcm-send-test.php --all           — to every registered device
 *   php scripts/fcm-send-test.php --customer 7    — to one customer's devices
 *   php scripts/fcm-send-test.php --quiet         — default channel instead of urgent
 *
 * Use it on a real phone to check the thing an emulator cannot show you: whether
 * the alert is actually audible with the ringer down, and whether it comes
 * through Do Not Disturb once that access has been granted.
 */

chdir(__DIR__ . '/..');
require_once 'includes/push.php';

$args     = array_slice($argv, 1);
$all      = in_array('--all', $args, true);
$quiet    = in_array('--quiet', $args, true);
$customer = null;
foreach ($args as $i => $a) {
    if ($a === '--customer' && isset($args[$i + 1])) {
        $customer = (int)$args[$i + 1];
    }
}

if (!fcm_configured()) {
    fwrite(STDERR, "FCM is not configured: set fcm.service_account in includes/config.php\n");
    exit(1);
}

$account = fcm_service_account();
echo 'project: ' . $account['project_id'] . PHP_EOL;

if ($customer !== null) {
    $stmt = db()->prepare('SELECT * FROM fcm_tokens WHERE customer_id = ?');
    $stmt->execute([$customer]);
    $rows = $stmt->fetchAll();
    $who = "customer $customer";
} elseif ($all) {
    $rows = db()->query('SELECT * FROM fcm_tokens')->fetchAll();
    $who = 'every registered device';
} else {
    $rows = db()->query('SELECT * FROM fcm_tokens WHERE admin_id IS NOT NULL')->fetchAll();
    $who = 'staff devices';
}

echo 'target:  ' . $who . ' (' . count($rows) . ' token' . (count($rows) === 1 ? '' : 's') . ')' . PHP_EOL;
foreach ($rows as $r) {
    echo '  - ' . substr($r['token'], 0, 12) . '… cust=' . ($r['customer_id'] ?? 'NULL')
       . ' admin=' . ($r['admin_id'] ?? 'NULL') . ' seen=' . ($r['last_seen_at'] ?? 'never') . PHP_EOL;
}
if (!$rows) {
    echo "nothing to send to — open the Android app so it registers a token.\n";
    exit(0);
}

$urgent = !$quiet;
echo 'channel: ' . ($urgent ? FCM_CHANNEL_URGENT . ' (high priority, alarm volume)' : FCM_CHANNEL_DEFAULT) . PHP_EOL;

[$sent, $failed] = fcm_send(
    $rows,
    $urgent ? 'Order cancelled' : 'Order update',
    $urgent
        ? 'TEST — a customer cancelled an order. This is what a real alert looks like.'
        : 'TEST — this is what a routine update looks like.',
    '/admin/orders',
    $urgent
);

echo "sent=$sent failed=$failed" . PHP_EOL;
echo 'Tokens FCM reported as dead were deleted; re-open the app to register again.' . PHP_EOL;
exit($failed > 0 ? 1 : 0);

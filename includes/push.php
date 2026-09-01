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
        'url'   => $url ?: ($cfg['base_url'] . '/account'),
        'icon'  => $cfg['base_url'] . '/assets/icon-192.png',
    ], JSON_UNESCAPED_UNICODE);

    $sent = 0;
    $failed = 0;

    // A row with a corrupt p256dh/auth makes the library throw (TypeError from
    // deep inside its encryption), so queue each one defensively — one bad
    // subscription must not stop the others being notified.
    $queued = 0;
    foreach ($subscriptionRows as $row) {
        try {
            $webPush->queueNotification(Subscription::create([
                'endpoint' => $row['endpoint'],
                'keys'     => ['p256dh' => $row['p256dh'], 'auth' => $row['auth_key']],
            ]), $payload);
            $queued++;
        } catch (Throwable $e) {
            $failed++;
            error_log('push: skipping unusable subscription ' . ($row['endpoint'] ?? '?') . ' — ' . $e->getMessage());
        }
    }
    if ($queued === 0) {
        return [0, $failed];
    }

    // Never let a delivery problem break the caller. Order status updates call
    // this AFTER committing the status change, so an exception here would 500 a
    // request whose real work already succeeded.
    try {
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
    } catch (Throwable $e) {
        error_log('push: flush failed — ' . $e->getMessage());
        $failed += $queued - $sent;
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

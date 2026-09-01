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
/** $urgent marks the notification as insistent in sw.js (stays on screen,
    longer vibration, re-alerts). It cannot override a silenced phone. */
function push_send(array $subscriptionRows, string $title, string $body, string $url = '', bool $urgent = false): array
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
        /* RELATIVE on purpose. The service worker that handles the click is
           served from the SPA's own origin, and both client.navigate() and
           clients.openWindow() resolve a relative path against it — so a
           notification always opens the app the user actually installed.
           Absolute URLs built from config's base_url sent people to whatever
           that setting happened to say (locally: :8080, the retired PHP app),
           and it has to be maintained per environment. This needs no config. */
        'url'   => $url ?: '/account',
        'icon'  => '/assets/icon-192.png',
        'urgent' => $urgent,
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

/**
 * Notify STAFF devices (migration_008) — used when something needs a human at
 * the kitchen, e.g. a customer cancelling their own order.
 *
 * $excludeAdminId skips the person who performed the action: a rep who just
 * cancelled an order does not need their own phone buzzing about it, and being
 * pinged for your own actions is how people learn to ignore notifications.
 */
function push_send_to_admins(string $title, string $body, string $url = '', ?int $excludeAdminId = null): array
{
    $sql = 'SELECT * FROM admin_push_subscriptions';
    $args = [];
    if ($excludeAdminId !== null) {
        $sql .= ' WHERE admin_id <> ?';
        $args[] = $excludeAdminId;
    }
    $stmt = db()->prepare($sql);
    $stmt->execute($args);
    // Staff alerts are always urgent — they exist because food is being cooked
    // for an order that no longer exists.
    return push_send($stmt->fetchAll(), $title, $body, $url, true);
}

function push_send_broadcast(string $title, string $body, string $url = ''): array
{
    $rows = db()->query('SELECT * FROM push_subscriptions')->fetchAll();
    return push_send($rows, $title, $body, $url);
}

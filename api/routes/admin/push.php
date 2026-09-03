<?php
/* POST /api/admin/push/subscribe    {subscription:{endpoint, keys:{p256dh, auth}}}
   POST /api/admin/push/unsubscribe  {endpoint}

   Staff device registration for kitchen alerts (migration_008). Mirrors the
   customer routes in api/routes/push.php but writes to admin_push_subscriptions
   and binds the row to the signed-in ADMIN, so push_send_to_admins() can reach
   the counter. Every role may register — a rider needs to hear about a
   cancellation as much as a manager does — so this is gated on being signed in,
   not on a capability. */
function route($method, $action, $parts): void
{
    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    $admin = require_admin_api();

    if ($action === 'subscribe') {
        $sub = $_POST['subscription'] ?? [];
        if (!is_array($sub)) {
            Response::error('Invalid subscription.');
        }
        $endpoint = (string)($sub['endpoint'] ?? '');
        $p256dh   = (string)($sub['keys']['p256dh'] ?? '');
        $auth     = (string)($sub['keys']['auth'] ?? '');
        if ($endpoint === '' || $p256dh === '' || $auth === ''
            || strlen($endpoint) > 500 || !str_starts_with($endpoint, 'https://')) {
            Response::error('Invalid subscription.');
        }
        db()->prepare(
            'INSERT INTO admin_push_subscriptions (admin_id, endpoint, p256dh, auth_key)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id),
                                     p256dh = VALUES(p256dh), auth_key = VALUES(auth_key)'
        )->execute([(int)$admin['id'], $endpoint, $p256dh, $auth]);
        Response::success('Subscribed');
    }

    if ($action === 'unsubscribe') {
        $endpoint = (string)($_POST['endpoint'] ?? '');
        if ($endpoint === '') {
            Response::error('Invalid endpoint.');
        }
        db()->prepare('DELETE FROM admin_push_subscriptions WHERE endpoint = ? AND admin_id = ?')
            ->execute([$endpoint, (int)$admin['id']]);
        Response::success('Unsubscribed');
    }

    /* The Android app's equivalent of subscribe (migration_012), binding the
       device's FCM token to this staff member so push_send_to_admins() can
       reach a counter phone.

       It only ever SETS admin_id, never clears it, and leaves customer_id
       alone: one phone can be a rep's work device and their personal customer
       account at once, and registering as staff must not sign the customer
       half out of notifications. */
    if ($action === 'fcm') {
        $token = trim((string)($_POST['token'] ?? ''));
        if ($token === '' || strlen($token) > 255) {
            Response::error('Invalid token.');
        }
        db()->prepare(
            'INSERT INTO fcm_tokens (token, admin_id, device_label, last_seen_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id),
                                     device_label = VALUES(device_label),
                                     last_seen_at = NOW()'
        )->execute([$token, (int)$admin['id'], auth_device_label()]);
        Response::success('Registered');
    }

    Response::error('Method not allowed', 405);
}

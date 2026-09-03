<?php
/* POST /api/push/subscribe    {subscription:{endpoint, keys:{p256dh, auth}}}
   POST /api/push/unsubscribe  {endpoint}     — for pushsubscriptionchange cleanup. */
function route($method, $action, $parts): void
{
    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }

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

        $customer = current_customer();
        db()->prepare(
            'INSERT INTO push_subscriptions (customer_id, endpoint, p256dh, auth_key)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id),
                                    p256dh = VALUES(p256dh), auth_key = VALUES(auth_key)'
        )->execute([$customer['id'] ?? null, $endpoint, $p256dh, $auth]);
        Response::success('Subscribed');
    }

    if ($action === 'unsubscribe') {
        $endpoint = (string)($_POST['endpoint'] ?? '');
        if ($endpoint === '') {
            Response::error('Invalid endpoint.');
        }
        db()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$endpoint]);
        Response::success('Unsubscribed');
    }

    /* The Android app's equivalent of subscribe (migration_012). It sends an
       FCM token rather than an endpoint and keys, because Google does the
       encrypting; see the migration for why that gets its own table.

       customer_id is whoever is signed in, or NULL: a guest should still be
       reachable about the order they just placed, exactly as push_subscriptions
       already allows. Re-registering updates the row instead of adding one, so
       the app may call this on every launch — which it does, since FCM can
       rotate a token at any time and the fresh one must replace the stale. */
    if ($action === 'fcm') {
        $token = trim((string)($_POST['token'] ?? ''));
        if ($token === '' || strlen($token) > 255) {
            Response::error('Invalid token.');
        }
        $customer = current_customer();
        db()->prepare(
            'INSERT INTO fcm_tokens (token, customer_id, device_label, last_seen_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id),
                                     device_label = VALUES(device_label),
                                     last_seen_at = NOW()'
        )->execute([$token, $customer['id'] ?? null, auth_device_label()]);
        Response::success('Registered');
    }

    Response::error('Unknown action.');
}
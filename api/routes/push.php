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

    Response::error('Unknown action.');
}
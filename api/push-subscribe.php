<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$body = read_json_body();
require_csrf_api($body);

$sub = $body['subscription'] ?? [];
$endpoint = (string)($sub['endpoint'] ?? '');
$p256dh   = (string)($sub['keys']['p256dh'] ?? '');
$auth     = (string)($sub['keys']['auth'] ?? '');

if ($endpoint === '' || $p256dh === '' || $auth === ''
    || strlen($endpoint) > 500 || !str_starts_with($endpoint, 'https://')) {
    json_error('Invalid subscription.');
}

$customer = current_customer();

db()->prepare(
    'INSERT INTO push_subscriptions (customer_id, endpoint, p256dh, auth_key)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id),
                             p256dh = VALUES(p256dh), auth_key = VALUES(auth_key)'
)->execute([$customer['id'] ?? null, $endpoint, $p256dh, $auth]);

json_response(['ok' => true]);

<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$customer = current_customer();
if (!$customer) {
    json_error('Please sign in first.', 401);
}

$body = read_json_body();
require_csrf_api($body);

$pin = trim((string)($body['pin'] ?? ''));
if (!preg_match('/^\d{4}$/', $pin)) {
    json_error('The PIN must be exactly 4 digits.');
}

db()->prepare('UPDATE customers SET pin_hash = ? WHERE id = ?')
    ->execute([password_hash($pin, PASSWORD_DEFAULT), $customer['id']]);

json_response(['ok' => true]);

<?php
/* POST /api/account/set-pin  {pin: ^\d{4}$} — set or change the customer's PIN. */
function route($method, $action, $parts): void
{
    if ($action !== 'set-pin' || $method !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    $customer = current_customer();
    if (!$customer) {
        Response::error('Please sign in first.', 401);
    }
    require_csrf_api($_POST);

    $pin = trim((string)($_POST['pin'] ?? ''));
    if (!preg_match('/^\d{4}$/', $pin)) {
        Response::error('The PIN must be exactly 4 digits.');
    }

    db()->prepare('UPDATE customers SET pin_hash = ? WHERE id = ?')
        ->execute([password_hash($pin, PASSWORD_DEFAULT), $customer['id']]);

    Response::success('PIN saved');
}
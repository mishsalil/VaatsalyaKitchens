<?php
/* POST /api/auth/login  {phone, pin}  — PIN login (rate-limited).
   POST /api/auth/logout                 — end the customer session. */
function route($method, $action, $parts): void
{
    if ($action === 'login') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }

        $phone = normalize_phone((string)($_POST['phone'] ?? ''));
        $pin   = trim((string)($_POST['pin'] ?? ''));

        if ($phone === null) {
            Response::error('Please write your 10-digit phone number.');
        }
        if (!preg_match('/^\d{4}$/', $pin)) {
            Response::error('Please write your 4-digit PIN.');
        }
        if (too_many_attempts('pin:' . $phone)) {
            Response::error('Too many tries. Please wait 15 minutes and try again, or call us.', 429);
        }

        $customer = find_customer_by_phone($phone);
        if ($customer && $customer['pin_hash'] && password_verify($pin, $customer['pin_hash'])) {
            clear_attempts('pin:' . $phone);
            Response::json([
                'token' => auth_token_issue('customer', (int)$customer['id'], auth_device_label()),
                'user'  => [
                    'id'      => (int)$customer['id'],
                    'name'    => $customer['name'],
                    'phone'   => $customer['phone'],
                    'has_pin' => true,
                ],
            ]);
        }

        record_attempt('pin:' . $phone);
        if ($customer && !$customer['pin_hash']) {
            Response::error('This number has no PIN yet. Just place an order — this device will remember you, and you can set a PIN afterwards.');
        }
        Response::error('That phone number and PIN do not match. Please try again.', 401);
    }

    /* Redeem a one-time claim link issued at the counter. Signs this device in
       and burns the token, so the link works exactly once. No PIN is set here —
       the customer lands on /account, where the normal PIN setup is offered. */
    if ($action === 'claim') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }

        $token = trim((string)($_POST['token'] ?? ''));
        if ($token === '') {
            Response::error('This link is not valid.');
        }
        if (too_many_attempts('claim:' . substr($token, 0, 24))) {
            Response::error('Too many tries. Please wait 15 minutes and try again, or call us.', 429);
        }
        $customerId = consume_claim_token($token);
        if ($customerId === null) {
            record_attempt('claim:' . substr($token, 0, 24));
            Response::error('This link has expired or has already been used. Please call us for a new one.', 401);
        }
        $customer = find_customer($customerId);
        if (!$customer) {
            Response::error('This link is not valid.', 401);
        }
        Response::json([
            'token' => auth_token_issue('customer', $customerId, auth_device_label()),
            'user'  => [
                'id'      => (int)$customer['id'],
                'name'    => $customer['name'],
                'phone'   => $customer['phone'],
                'has_pin' => $customer['pin_hash'] !== null,
            ],
        ]);
    }

    if ($action === 'logout') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }
        // Revoke server-side, so signing out actually ends this device's access
        // rather than merely dropping the token from local storage.
        auth_token_revoke(auth_bearer_token());
        Response::success('Signed out');
    }

    Response::error('Method not allowed', 405);
}
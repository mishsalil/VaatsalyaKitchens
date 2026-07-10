<?php
/* Customer authentication: PHP session + long-lived remember-me cookie
   (selector:validator pattern — only a hash of the validator is stored). */

require_once __DIR__ . '/db.php';

const REMEMBER_COOKIE = 'vk_remember';
const REMEMBER_DAYS   = 180;

function customer_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Returns the logged-in customer row or null. Auto-logs-in from the remember cookie. */
function current_customer(): ?array
{
    static $cached = false;
    static $customer = null;
    if ($cached) {
        return $customer;
    }
    $cached = true;

    customer_session_start();

    if (!empty($_SESSION['customer_id'])) {
        $customer = find_customer((int)$_SESSION['customer_id']);
        return $customer;
    }

    // Try the remember cookie
    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if ($cookie && str_contains($cookie, ':')) {
        [$selector, $validator] = explode(':', $cookie, 2);
        $stmt = db()->prepare(
            'SELECT * FROM customer_tokens WHERE selector = ? AND expires_at > NOW()'
        );
        $stmt->execute([$selector]);
        $token = $stmt->fetch();
        if ($token && hash_equals($token['validator_hash'], hash('sha256', $validator))) {
            $_SESSION['customer_id'] = (int)$token['customer_id'];
            $customer = find_customer((int)$token['customer_id']);
            return $customer;
        }
        // Stale or tampered cookie — clear it
        setcookie(REMEMBER_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
    }

    return null;
}

function find_customer(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function find_customer_by_phone(string $phone): ?array
{
    $stmt = db()->prepare('SELECT * FROM customers WHERE phone = ?');
    $stmt->execute([$phone]);
    return $stmt->fetch() ?: null;
}

/** Log the customer into the session and (re)issue a remember cookie for this device. */
function login_customer(int $customerId): void
{
    customer_session_start();
    session_regenerate_id(true);
    $_SESSION['customer_id'] = $customerId;
    issue_remember_token($customerId);
}

function issue_remember_token(int $customerId): void
{
    $selector  = bin2hex(random_bytes(12));      // 24 chars
    $validator = bin2hex(random_bytes(32));
    $expires   = (new DateTime('+' . REMEMBER_DAYS . ' days'))->format('Y-m-d H:i:s');

    $stmt = db()->prepare(
        'INSERT INTO customer_tokens (customer_id, selector, validator_hash, expires_at)
         VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$customerId, $selector, hash('sha256', $validator), $expires]);

    setcookie(REMEMBER_COOKIE, $selector . ':' . $validator, [
        'expires'  => time() + REMEMBER_DAYS * 86400,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    // Keep at most 10 devices per customer
    db()->prepare(
        'DELETE FROM customer_tokens WHERE customer_id = ? AND id NOT IN (
            SELECT id FROM (SELECT id FROM customer_tokens WHERE customer_id = ?
                            ORDER BY id DESC LIMIT 10) keep
         )'
    )->execute([$customerId, $customerId]);
}

function logout_customer(): void
{
    customer_session_start();

    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if ($cookie && str_contains($cookie, ':')) {
        [$selector] = explode(':', $cookie, 2);
        db()->prepare('DELETE FROM customer_tokens WHERE selector = ?')->execute([$selector]);
    }
    setcookie(REMEMBER_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);

    $_SESSION = [];
    session_destroy();
}

/**
 * Auto-registration: create or update the customer record from order details.
 * Returns the customer id.
 */
function upsert_customer(string $name, string $phone): int
{
    $existing = find_customer_by_phone($phone);
    if ($existing) {
        db()->prepare('UPDATE customers SET name = ?, last_order_at = NOW() WHERE id = ?')
            ->execute([$name, $existing['id']]);
        return (int)$existing['id'];
    }
    db()->prepare('INSERT INTO customers (name, phone, last_order_at) VALUES (?, ?, NOW())')
        ->execute([$name, $phone]);
    return (int)db()->lastInsertId();
}

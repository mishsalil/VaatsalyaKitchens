<?php
/* Customer authentication: bearer tokens only (see includes/tokens.php).
   The PHP session and the remember-me cookie it used to carry are gone —
   a native WebView serves the app from https://localhost and never sends
   either, so one credential now works everywhere instead of two that worked
   in one place each. customer_tokens survives for single-use claim links. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/tokens.php';

/** Returns the signed-in customer row, or null. */
function current_customer(): ?array
{
    static $cached = false;
    static $customer = null;
    if ($cached) {
        return $customer;
    }
    $cached = true;

    $claim = auth_token_resolve(auth_bearer_token());
    // find_customer() fails closed: a token outliving its customer authenticates nobody.
    $customer = ($claim && $claim['subject_type'] === 'customer')
        ? find_customer($claim['subject_id'])
        : null;

    return $customer;
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

/* --- One-time claim links (counter orders) ---------------------------------
   A customer whose order was entered by a rep has no pin_hash and no session,
   so they cannot sign in or track the order. The rep WhatsApps them a claim
   link; opening it signs that device in once, after which the normal PIN setup
   on /account applies.

   Reuses customer_tokens: same selector/validator shape, same trust model (the
   holder of the secret is the customer). The difference is lifetime — claim
   tokens are short-lived and deleted the moment they are used. */
const CLAIM_TOKEN_DAYS = 7;

/** Issue a single-use claim token. Returns "selector.validator" for the URL. */
function issue_claim_token(int $customerId): string
{
    $selector  = bin2hex(random_bytes(12));      // 24 chars, matches the column
    $validator = bin2hex(random_bytes(32));
    db()->prepare(
        'INSERT INTO customer_tokens (customer_id, selector, validator_hash, expires_at)
         VALUES (?, ?, ?, ?)'
    )->execute([
        $customerId,
        $selector,
        hash('sha256', $validator),
        (new DateTime('+' . CLAIM_TOKEN_DAYS . ' days'))->format('Y-m-d H:i:s'),
    ]);
    return $selector . '.' . $validator;
}

/** Verify and BURN a claim token. Returns the customer id, or null if invalid. */
function consume_claim_token(string $token): ?int
{
    if (!str_contains($token, '.')) {
        return null;
    }
    [$selector, $validator] = explode('.', $token, 2);
    $stmt = db()->prepare('SELECT * FROM customer_tokens WHERE selector = ? AND expires_at > NOW()');
    $stmt->execute([$selector]);
    $row = $stmt->fetch();
    if (!$row || !hash_equals($row['validator_hash'], hash('sha256', $validator))) {
        return null;
    }
    // Single use: burn it before granting the session.
    db()->prepare('DELETE FROM customer_tokens WHERE id = ?')->execute([(int)$row['id']]);
    return (int)$row['customer_id'];
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

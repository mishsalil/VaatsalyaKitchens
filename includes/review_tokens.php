<?php
/* Tokens that grant exactly one right: rating one order.

   Same selector/validator shape as the claim tokens in includes/auth.php — the
   selector is the indexed lookup, only a sha256 of the validator is stored, and
   comparison is hash_equals. A stolen database yields nothing replayable.

   Three deliberate differences from a claim token:

   1. Resolving does NOT burn. A customer opens the link, gets distracted, comes
      back — burning on first view would lose the review. Burning happens on
      successful submit, and the UNIQUE on order_reviews.order_id is the real
      guard against a second review.
   2. It is NOT a session. It must never be accepted by auth_token_resolve(),
      which is why it lives in its own table rather than in auth_tokens.
   3. Many tokens can be live for one order. The plaintext validator exists only
      at creation, so "copy the rating link" for an order that already has one
      would otherwise have to rotate it and kill the link push already sent. */

require_once __DIR__ . '/db.php';

const REVIEW_TOKEN_DAYS = 14;

/** Issue a token for an order. Returns "selector.validator" — the only moment
 *  the validator exists in plaintext. Return it to the caller, never log it. */
function review_token_issue(int $orderId): string
{
    $selector  = bin2hex(random_bytes(12));      // 24 chars, matches the column
    $validator = bin2hex(random_bytes(32));

    db()->prepare(
        'INSERT INTO review_tokens (order_id, selector, validator_hash, expires_at)
         VALUES (?, ?, ?, ?)'
    )->execute([
        $orderId,
        $selector,
        hash('sha256', $validator),
        (new DateTime('+' . REVIEW_TOKEN_DAYS . ' days'))->format('Y-m-d H:i:s'),
    ]);

    return $selector . '.' . $validator;
}

/** Resolve a token to its order id, or null. Does not burn, does not extend. */
function review_token_resolve(?string $token): ?int
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return null;
    }
    [$selector, $validator] = explode('.', $token, 2);

    $stmt = db()->prepare('SELECT * FROM review_tokens WHERE selector = ? AND expires_at > NOW()');
    $stmt->execute([$selector]);
    $row = $stmt->fetch();

    if (!$row || !hash_equals($row['validator_hash'], hash('sha256', $validator))) {
        return null;
    }
    return (int)$row['order_id'];
}

/** Burn every token for an order — called once the review is in. */
function review_tokens_burn(int $orderId): void
{
    db()->prepare('DELETE FROM review_tokens WHERE order_id = ?')->execute([$orderId]);
}

<?php
/* Ratings and reviews — eligibility and timing (migration_013).

   Pure functions over an order row. No database access here on purpose: the
   sweep, the admin screen and the verification script all need the same answer
   to "when is this order due for a prompt?", and a pure function is the only
   version of that answer that can be checked exhaustively. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/review_tokens.php';
require_once __DIR__ . '/settings.php';

/** Minutes after a delivery is MARKED before we ask. */
const REVIEW_DELAY_DELIVERED_MIN = 30;

/** Minutes after the scheduled (or counter) time when delivery was never marked. */
const REVIEW_DELAY_FALLBACK_MIN = 60;

/* `new` is excluded because an order nobody confirmed was probably never
   cooked, and `cancelled` because there is nothing to rate. The three middle
   statuses ARE prompted on the fallback: in practice food goes out and nobody
   touches the screen, and treating that as "never delivered" would lose most
   of the ratings we are building this for. */
function review_eligible_status(string $status): bool
{
    return in_array($status, ['confirmed', 'preparing', 'out_for_delivery', 'delivered'], true);
}

/**
 * When this order becomes due for a review prompt, or null if it never does.
 *
 * needed_at is NULL for every counter order — api/routes/admin/orders.php does
 * not insert it — so created_at is not a guess about missing data, it is the
 * walk-in path, where the food was served immediately.
 */
function review_due_at(array $order): ?string
{
    if (!review_eligible_status((string)($order['status'] ?? ''))) {
        return null;
    }

    $delivered = $order['delivered_at'] ?? null;
    if ($delivered) {
        $base = new DateTimeImmutable((string)$delivered);
        $mins = REVIEW_DELAY_DELIVERED_MIN;
    } else {
        $base = new DateTimeImmutable((string)($order['needed_at'] ?? $order['created_at']));
        $mins = REVIEW_DELAY_FALLBACK_MIN;
    }

    return $base->modify('+' . $mins . ' minutes')->format('Y-m-d H:i:s');
}

/** Longest comment we store. Beyond this it is not feedback, it is a payload. */
const REVIEW_COMMENT_MAX = 1000;

/**
 * Write a review. Throws InvalidArgumentException on any refusal, and writes
 * nothing when it does — the whole thing runs in one transaction so a bad dish
 * row cannot leave a half-written review behind.
 *
 * Callers: the public POST route, and the verification script.
 */
function review_submit(int $orderId, int $stars, ?string $comment, array $items, string $source): int
{
    if ($stars < 1 || $stars > 5) {
        throw new InvalidArgumentException('Please choose between 1 and 5 stars.');
    }
    if (!in_array($source, ['link', 'account'], true)) {
        throw new InvalidArgumentException('Unknown review source.');
    }

    $comment = $comment === null ? null : trim($comment);
    if ($comment === '') {
        $comment = null;
    }
    if ($comment !== null && mb_strlen($comment) > REVIEW_COMMENT_MAX) {
        throw new InvalidArgumentException('That comment is too long.');
    }

    $db = db();
    $stmt = $db->prepare('SELECT id, customer_id, status FROM orders WHERE id = ?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        throw new InvalidArgumentException('That order no longer exists.');
    }
    if (!review_eligible_status((string)$order['status'])) {
        throw new InvalidArgumentException('That order cannot be rated.');
    }

    /* Every dish row must belong to THIS order. Without this check a token for
       one order could write ratings against another customer's dishes. */
    $lines = [];
    $lStmt = $db->prepare('SELECT id, menu_item_id FROM order_items WHERE order_id = ?');
    $lStmt->execute([$orderId]);
    foreach ($lStmt->fetchAll() as $l) {
        $lines[(int)$l['id']] = $l['menu_item_id'] === null ? null : (int)$l['menu_item_id'];
    }
    foreach ($items as $item) {
        $lineId = (int)($item['order_item_id'] ?? 0);
        $lineStars = (int)($item['stars'] ?? 0);
        if (!array_key_exists($lineId, $lines)) {
            throw new InvalidArgumentException('That dish is not part of this order.');
        }
        if ($lineStars < 1 || $lineStars > 5) {
            throw new InvalidArgumentException('Please choose between 1 and 5 stars for each dish.');
        }
    }

    $db->beginTransaction();
    try {
        $db->prepare(
            'INSERT INTO order_reviews (order_id, customer_id, stars, comment, source)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$orderId, $order['customer_id'], $stars, $comment, $source]);
        $reviewId = (int)$db->lastInsertId();

        $ins = $db->prepare(
            'INSERT INTO order_item_reviews (review_id, order_item_id, menu_item_id, stars)
             VALUES (?, ?, ?, ?)'
        );
        foreach ($items as $item) {
            $lineId = (int)$item['order_item_id'];
            $ins->execute([$reviewId, $lineId, $lines[$lineId], (int)$item['stars']]);
        }

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        /* 23000 is the integrity-constraint family; here it is the UNIQUE on
           order_id, i.e. this order was already rated. */
        if ($e->getCode() === '23000') {
            throw new InvalidArgumentException('This order has already been rated.');
        }
        throw $e;
    }

    review_tokens_burn($orderId);
    return $reviewId;
}

/** How many times we try to push before giving up on an order. */
const REVIEW_PROMPT_MAX_ATTEMPTS = 3;

/**
 * Orders that are due for a prompt right now.
 *
 * SQL narrows; review_due_at() decides. The due-time comparison is deliberately
 * NOT in SQL: it is the one rule with real edge cases, and having it in a pure
 * PHP function is what lets verify-review-due.php check it exhaustively.
 * The SQL below is only the cheap filter that keeps the row count small.
 */
function review_prompt_candidates(int $limit = 50): array
{
    $since = setting('reviews_since', '1970-01-01 00:00:00');

    $stmt = db()->prepare(
        'SELECT o.id, o.customer_id, o.status, o.delivered_at, o.needed_at, o.created_at
           FROM orders o
           LEFT JOIN order_reviews  r ON r.order_id = o.id
           LEFT JOIN review_prompts p ON p.order_id = o.id
          WHERE o.created_at >= ?
            AND o.customer_id IS NOT NULL
            AND o.status IN (\'confirmed\', \'preparing\', \'out_for_delivery\', \'delivered\')
            AND r.id IS NULL
            AND (p.order_id IS NULL OR (p.sent_at IS NULL AND p.attempts < ?))
          ORDER BY o.id
          LIMIT ' . (int)($limit * 4)
    );
    $stmt->execute([$since, REVIEW_PROMPT_MAX_ATTEMPTS]);

    $now = new DateTimeImmutable();
    $due = [];
    foreach ($stmt->fetchAll() as $order) {
        $dueAt = review_due_at($order);
        if ($dueAt !== null && new DateTimeImmutable($dueAt) <= $now) {
            $due[] = $order;
            if (count($due) >= $limit) {
                break;
            }
        }
    }
    return $due;
}

/**
 * Record the outcome of a prompt attempt.
 *
 * due_at is rewritten every pass on purpose. A row can be created by the manual
 * rating-link endpoint before delivery, when the computed value is the
 * 60-minute fallback; once delivery is marked the right answer becomes
 * delivered_at + 30. The stored column is a cache for display, never the truth.
 */
function review_prompt_record(int $orderId, string $dueAt, bool $sent, ?string $error): void
{
    db()->prepare(
        'INSERT INTO review_prompts (order_id, due_at, sent_at, attempts, last_error)
         VALUES (?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
            due_at     = VALUES(due_at),
            sent_at    = COALESCE(review_prompts.sent_at, VALUES(sent_at)),
            attempts   = review_prompts.attempts + 1,
            last_error = VALUES(last_error)'
    )->execute([
        $orderId,
        $dueAt,
        $sent ? (new DateTime())->format('Y-m-d H:i:s') : null,
        $error === null ? null : mb_substr($error, 0, 190),
    ]);
}

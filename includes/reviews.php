<?php
/* Ratings and reviews — eligibility and timing (migration_013).

   Pure functions over an order row. No database access here on purpose: the
   sweep, the admin screen and the verification script all need the same answer
   to "when is this order due for a prompt?", and a pure function is the only
   version of that answer that can be checked exhaustively. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/review_tokens.php';

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

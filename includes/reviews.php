<?php
/* Ratings and reviews — eligibility and timing (migration_013).

   Pure functions over an order row. No database access here on purpose: the
   sweep, the admin screen and the verification script all need the same answer
   to "when is this order due for a prompt?", and a pure function is the only
   version of that answer that can be checked exhaustively. */

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

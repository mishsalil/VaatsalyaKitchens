<?php
/* POST /api/account/set-pin        {pin: ^\d{4}$} — set or change the customer's PIN.
   GET  /api/account/pending-review — the in-app door to the rating page (no
        token minted here; see review-link below).
   POST /api/account/review-link    {order_id} — mint a rating token on intent,
        i.e. when the customer actually taps the card. */
function route($method, $action, $parts): void
{
    if ($action === 'set-pin' && $method === 'POST') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }

        $pin = trim((string)($_POST['pin'] ?? ''));
        if (!preg_match('/^\d{4}$/', $pin)) {
            Response::error('The PIN must be exactly 4 digits.');
        }

        db()->prepare('UPDATE customers SET pin_hash = ? WHERE id = ?')
            ->execute([password_hash($pin, PASSWORD_DEFAULT), $customer['id']]);

        Response::success('PIN saved');
    }

    /* The in-app door to the rating page. This is how a customer who never
       granted push permission gets asked at all — which, on a storefront, is
       most of them.

       Display only: no token is minted here. PendingReviewCard mounts on both
       Home and MyAccount, so if this endpoint minted a token on every render,
       ordinary browsing would insert an unbounded, unpruned row per page view
       (review_tokens has no expiry sweep). Minting moves to review-link below,
       which only fires when the customer actually taps the card. */
    if ($action === 'pending-review' && $method === 'GET') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }

        require_once __DIR__ . '/../../includes/reviews.php';

        $order = review_next_due_order_for_customer((int)$customer['id']);
        Response::json(['order_id' => $order !== null ? (int)$order['id'] : null]);
    }

    /* Mint a rating token for one order, on intent. The customer must be
       signed in, the order must be theirs, and it must still be unrated and
       due — review_due_order_for_customer() is the SAME rule
       review_next_due_order_for_customer() (above) and review_prompt_candidates()
       (the cron sweep) use, via the shared review_cutover_since() fail-closed
       helper. Anything that doesn't match gets one generic refusal: this must
       not reveal whether an order id exists, belongs to someone else, or is
       merely not due yet. */
    if ($action === 'review-link' && $method === 'POST') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }

        $orderId = (int)($_POST['order_id'] ?? 0);
        if ($orderId <= 0) {
            Response::error('That order was not found.', 404);
        }

        require_once __DIR__ . '/../../includes/reviews.php';
        require_once __DIR__ . '/../../includes/review_tokens.php';

        $order = review_due_order_for_customer($orderId, (int)$customer['id']);
        if ($order === null) {
            Response::error('That order was not found.', 404);
        }

        Response::json(['token' => review_token_issue($orderId)]);
    }

    Response::error('Method not allowed', 405);
}
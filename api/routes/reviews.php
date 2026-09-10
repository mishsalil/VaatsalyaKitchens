<?php
/* Public rating endpoints, authenticated by a review token and nothing else.

   GET  /api/reviews/{token}  — the order, as the rating page needs it
   POST /api/reviews/{token}  — submit the rating

   A review token is a WEAKER credential than a session: it travels in a URL,
   through WhatsApp, and possibly through a group chat. So this route returns
   only what the page must render — no phone number, no address, no totals. */

require_once __DIR__ . '/../../includes/reviews.php';
require_once __DIR__ . '/../../includes/review_tokens.php';
require_once __DIR__ . '/../../includes/push.php';

function route($method, $action, $parts): void
{
    $token = (string)($parts[1] ?? '');
    if ($token === '') {
        Response::error('Rating link not found.', 404);
    }

    /* Rate limit on the selector, matching how claim redemption is guarded in
       api/routes/auth.php. Guessing a validator is infeasible; this stops
       someone hammering the endpoint from trying. */
    $throttleKey = 'review:' . substr($token, 0, 24);
    if (too_many_attempts($throttleKey)) {
        Response::error('Too many attempts. Please try again later.', 429);
    }

    $orderId = review_token_resolve($token);
    if ($orderId === null) {
        record_attempt($throttleKey);
        Response::error('This rating link has expired or has already been used.', 404);
    }

    if ($method === 'GET') {
        review_route_get($orderId);
    }
    if ($method === 'POST') {
        review_route_post($orderId);
    }
    Response::error('Method not allowed', 405);
}

function review_route_get(int $orderId): void
{
    $db = db();
    $stmt = $db->prepare(
        'SELECT o.id, o.name, o.created_at,
                (SELECT COUNT(*) FROM order_reviews r WHERE r.order_id = o.id) AS reviewed
           FROM orders o WHERE o.id = ?'
    );
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        Response::error('That order no longer exists.', 404);
    }

    $lStmt = $db->prepare(
        'SELECT id AS order_item_id, menu_item_id, item_name, qty
           FROM order_items WHERE order_id = ? ORDER BY id'
    );
    $lStmt->execute([$orderId]);

    $lines = array_map(fn($l) => [
        'order_item_id' => (int)$l['order_item_id'],
        'menu_item_id'  => $l['menu_item_id'] === null ? null : (int)$l['menu_item_id'],
        'item_name'     => $l['item_name'],
        'qty'           => (int)$l['qty'],
    ], $lStmt->fetchAll());

    /* First name only. The full name is not needed to say hello, and this link
       may be sitting in a group chat. */
    $firstName = trim(explode(' ', trim((string)$order['name']))[0] ?? '');

    Response::json([
        'order_id'         => (int)$order['id'],
        'ordered_on'       => $order['created_at'],
        'first_name'       => $firstName,
        'already_reviewed' => (int)$order['reviewed'] > 0,
        'lines'            => $lines,
    ]);
}

function review_route_post(int $orderId): void
{
    $stars   = (int)($_POST['stars'] ?? 0);
    $comment = isset($_POST['comment']) ? (string)$_POST['comment'] : null;
    $items   = is_array($_POST['items'] ?? null) ? $_POST['items'] : [];

    /* `account` when the request ALSO carries a valid customer token for this
       order's customer. It records which channel is earning its keep and is
       never used for authorisation — the review token alone decides that. */
    $customer = current_customer();
    $source = 'link';
    if ($customer) {
        $stmt = db()->prepare('SELECT customer_id FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        if ((int)$stmt->fetchColumn() === (int)$customer['id']) {
            $source = 'account';
        }
    }

    try {
        review_submit($orderId, $stars, $comment, $items, $source);
    } catch (InvalidArgumentException $e) {
        /* Already-rated is a conflict, not a bad request: the client should
           show the thank-you state rather than ask the customer to try again. */
        $alreadyRated = str_contains($e->getMessage(), 'already been rated');
        Response::error($e->getMessage(), $alreadyRated ? 409 : 400);
    }

    if ($stars <= 2) {
        /* Deliberately the DEFAULT channel. vk_urgent and OrderAlarmService
           ring at full volume through silent mode, which is right for an order
           nobody has seen and wrong for a bad review at 11pm. */
        push_send_to_admins(
            'Low rating received',
            $stars . '-star rating on order #' . $orderId,
            '/admin/reviews'
        );
    }

    Response::success('Thank you for the feedback');
}

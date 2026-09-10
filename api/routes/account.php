<?php
/* POST /api/account/set-pin      {pin: ^\d{4}$} — set or change the customer's PIN.
   GET  /api/account/pending-review — the in-app door to the rating page. */
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
       most of them. */
    if ($action === 'pending-review' && $method === 'GET') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }

        require_once __DIR__ . '/../../includes/reviews.php';
        require_once __DIR__ . '/../../includes/review_tokens.php';

        $stmt = db()->prepare(
            'SELECT o.id, o.status, o.delivered_at, o.needed_at, o.created_at
               FROM orders o
               LEFT JOIN order_reviews r ON r.order_id = o.id
              WHERE o.customer_id = ?
                AND o.created_at >= ?
                AND r.id IS NULL
              ORDER BY o.id DESC
              LIMIT 5'
        );
        $stmt->execute([$customer['id'], setting('reviews_since', '1970-01-01 00:00:00')]);

        /* "Now" comes from the DATABASE, for the same reason as in
           review_prompt_candidates(): every timestamp compared here was written
           by MySQL, and PHP's clock can differ from it by hours. */
        $now = new DateTimeImmutable((string)db()->query('SELECT NOW()')->fetchColumn());
        foreach ($stmt->fetchAll() as $order) {
            $dueAt = review_due_at($order);
            if ($dueAt !== null && new DateTimeImmutable($dueAt) <= $now) {
                Response::json([
                    'order_id' => (int)$order['id'],
                    'token'    => review_token_issue((int)$order['id']),
                ]);
            }
        }
        Response::json(['order_id' => null]);
    }

    Response::error('Method not allowed', 405);
}
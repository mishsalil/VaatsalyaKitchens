<?php
/* Admin reviews — the internal feedback list. Review text is never public;
   this is the only place it is read. */

require_once __DIR__ . '/../../../includes/reviews.php';

function route($method, $action, $parts): void
{
    $admin = require_admin_cap('reviews');

    if ($action === 'index' && $method === 'GET') {
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $per   = 25;
        $where = [];
        $args  = [];

        if (isset($_GET['min_stars']) && $_GET['min_stars'] !== '') {
            $where[] = 'r.stars >= ?';
            $args[]  = (int)$_GET['min_stars'];
        }
        if (isset($_GET['max_stars']) && $_GET['max_stars'] !== '') {
            $where[] = 'r.stars <= ?';
            $args[]  = (int)$_GET['max_stars'];
        }
        if (($_GET['acked'] ?? '') === '0') {
            $where[] = 'r.acked_at IS NULL';
        } elseif (($_GET['acked'] ?? '') === '1') {
            $where[] = 'r.acked_at IS NOT NULL';
        }
        $sql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

        $countStmt = db()->prepare('SELECT COUNT(*) FROM order_reviews r' . $sql);
        $countStmt->execute($args);
        $total = (int)$countStmt->fetchColumn();

        $stmt = db()->prepare(
            'SELECT r.id, r.order_id, r.stars, r.comment, r.source, r.created_at,
                    r.acked_at, r.acked_label, o.name, o.phone
               FROM order_reviews r
               JOIN orders o ON o.id = r.order_id' . $sql . '
              ORDER BY r.created_at DESC, r.id DESC
              LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per)
        );
        $stmt->execute($args);
        $reviews = $stmt->fetchAll();

        // Per-dish rows for the page of reviews we are returning, in one query.
        $byReview = [];
        $ids = array_map(fn($r) => (int)$r['id'], $reviews);
        if ($ids) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $dStmt = db()->prepare(
                "SELECT ir.review_id, ir.stars, ir.menu_item_id, oi.item_name
                   FROM order_item_reviews ir
                   LEFT JOIN order_items oi ON oi.id = ir.order_item_id
                  WHERE ir.review_id IN ($ph)"
            );
            $dStmt->execute($ids);
            foreach ($dStmt->fetchAll() as $d) {
                $byReview[(int)$d['review_id']][] = [
                    'item_name' => $d['item_name'] ?? 'Removed item',
                    'stars'     => (int)$d['stars'],
                ];
            }
        }

        Response::json([
            'total'   => $total,
            'reviews' => array_map(fn($r) => [
                'id'          => (int)$r['id'],
                'order_id'    => (int)$r['order_id'],
                'stars'       => (int)$r['stars'],
                'comment'     => $r['comment'],
                'source'      => $r['source'],
                'created_at'  => $r['created_at'],
                'acked_at'    => $r['acked_at'],
                'acked_label' => $r['acked_label'],
                'name'        => $r['name'],
                'phone'       => $r['phone'],
                'dishes'      => $byReview[(int)$r['id']] ?? [],
            ], $reviews),
        ]);
    }

    if ($action === 'ack' && $method === 'POST') {
        $id = (int)($parts[3] ?? 0);
        if ($id <= 0) {
            Response::error('Which review?', 400);
        }
        $stmt = db()->prepare(
            'UPDATE order_reviews
                SET acked_at = NOW(), acked_by = ?, acked_label = ?
              WHERE id = ? AND acked_at IS NULL'
        );
        $stmt->execute([(int)$admin['id'], (string)$admin['username'], $id]);
        /* This screen exists so a complaint is never silently dropped — an ack
           that quietly no-ops (unknown id, or already acked by someone else)
           must not report success. */
        if ($stmt->rowCount() === 0) {
            Response::error('That review was not found, or has already been followed up.', 404);
        }
        Response::success('Marked as followed up');
    }

    Response::error('Method not allowed', 405);
}

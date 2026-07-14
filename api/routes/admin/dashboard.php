<?php
/* GET /api/admin/dashboard — the 5 dashboard stat tiles + the last 25 open orders.
   The VKADMIN session is started by api/index.php; requires an admin. */
function route($method, $action, $parts): void
{
    require_admin_cap('dashboard');

    if ($action !== 'index' || $method !== 'GET') {
        Response::error('Method not allowed', 405);
    }

    $pdo = db();

    $stats = [
        'new_orders'       => (int)$pdo->query("SELECT COUNT(*) AS c FROM orders WHERE status = 'new'")->fetch()['c'],
        'orders_today'     => (int)$pdo->query("SELECT COUNT(*) AS c FROM orders WHERE DATE(created_at) = CURDATE()")->fetch()['c'],
        'revenue_today'    => (float)$pdo->query("SELECT COALESCE(SUM(total_estimate),0) AS s FROM orders WHERE status <> 'cancelled' AND DATE(created_at) = CURDATE()")->fetch()['s'],
        'customers'        => (int)$pdo->query('SELECT COUNT(*) AS c FROM customers')->fetch()['c'],
        'push_subscribers' => (int)$pdo->query('SELECT COUNT(*) AS c FROM push_subscriptions')->fetch()['c'],
    ];

    // Last 25 open orders (not delivered / not cancelled).
    $stmt = $pdo->prepare(
        "SELECT o.id, o.name, o.phone, o.occasion, o.needed_on, o.address_text, o.status,
                o.total_estimate, o.created_at, o.customer_id,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
           FROM orders o
          WHERE o.status NOT IN ('delivered','cancelled')
          ORDER BY o.id DESC LIMIT 25"
    );
    $stmt->execute();
    $open = $stmt->fetchAll();
    foreach ($open as &$o) {
        $o['total_estimate'] = (float)$o['total_estimate'];
        $o['item_count'] = (int)$o['item_count'];
        $o['customer_id'] = $o['customer_id'] !== null ? (int)$o['customer_id'] : null;
    }
    unset($o);

    Response::json(['stats' => $stats, 'open_orders' => $open]);
}
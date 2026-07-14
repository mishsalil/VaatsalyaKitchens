<?php
/* GET  /api/admin/orders                  — recent orders (limit 200) with item_count.
   GET  /api/admin/orders/show/{id}        — full order + items + customer.
   POST /api/admin/orders/update_status/{id} — change status; pushes the customer on change.
   The VKADMIN session is started by api/index.php; every action requires an admin. */
require_once __DIR__ . '/../../../includes/push.php';

function route($method, $action, $parts): void
{
    $admin = require_admin_cap('orders');

    // --- list (Kanban source: all recent orders, grouped client-side) ---
    if ($action === 'index' && $method === 'GET') {
        $statusFilter = $_GET['status'] ?? '';
        $valid = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
        $sql =
            'SELECT o.id, o.name, o.phone, o.occasion, o.needed_on, o.address_text,
                    o.status, o.total_estimate, o.subtotal, o.cgst, o.sgst, o.gst_rate,
                    o.created_at, o.customer_id, o.branch_id,
                    b.name AS branch_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
               FROM orders o
               LEFT JOIN branches b ON b.id = o.branch_id';
        $args = [];
        if (in_array($statusFilter, $valid, true)) {
            $sql .= ' WHERE o.status = ?';
            $args[] = $statusFilter;
        }
        $sql .= ' ORDER BY o.id DESC LIMIT 200';
        $stmt = db()->prepare($sql);
        $stmt->execute($args);
        $orders = $stmt->fetchAll();
        foreach ($orders as &$o) {
            $o['total_estimate'] = (float)$o['total_estimate'];
            $o['subtotal']  = (float)$o['subtotal'];
            $o['cgst']      = (float)$o['cgst'];
            $o['sgst']      = (float)$o['sgst'];
            $o['gst_rate']  = (float)$o['gst_rate'];
            $o['item_count'] = (int)$o['item_count'];
            $o['customer_id'] = $o['customer_id'] !== null ? (int)$o['customer_id'] : null;
        }
        unset($o);
        Response::json(['orders' => $orders]);
    }

    // --- export all orders as CSV (read-only, no item rows) ---
    if ($action === 'export' && $method === 'GET') {
        $statusFilter = $_GET['status'] ?? '';
        $valid = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
        $sql =
            'SELECT o.id, o.created_at, o.needed_on, o.name, o.phone, o.status,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                    o.subtotal, o.cgst, o.sgst, o.total_estimate,
                    o.address_text, b.name AS branch_name
               FROM orders o
               LEFT JOIN branches b ON b.id = o.branch_id';
        $args = [];
        if (in_array($statusFilter, $valid, true)) {
            $sql .= ' WHERE o.status = ?';
            $args[] = $statusFilter;
        }
        $sql .= ' ORDER BY o.id DESC LIMIT 5000';
        $stmt = db()->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="vaatsalya-orders.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'created_at', 'needed_on', 'name', 'phone', 'status',
                       'item_count', 'subtotal', 'cgst', 'sgst', 'total', 'address', 'branch']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['id'], $r['created_at'], $r['needed_on'], $r['name'], $r['phone'], $r['status'],
                (int)$r['item_count'], (float)$r['subtotal'], (float)$r['cgst'],
                (float)$r['sgst'], (float)$r['total_estimate'], $r['address_text'] ?? '', $r['branch_name'] ?? '',
            ]);
        }
        fclose($out);
        exit;
    }

    // --- show one order (full detail for the drawer) ---
    if ($action === 'show' && $method === 'GET') {
        $id = (int)($parts[3] ?? 0);
        $stmt = db()->prepare(
            'SELECT o.id, o.customer_id, o.name, o.phone, o.occasion, o.needed_on,
                    o.address_text, o.lat, o.lng, o.notes, o.status, o.total_estimate,
                    o.subtotal, o.cgst, o.sgst, o.gst_rate,
                    o.created_at, o.branch_id, b.name AS branch_name
               FROM orders o
               LEFT JOIN branches b ON b.id = o.branch_id
              WHERE o.id = ?'
        );
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        $itemStmt = db()->prepare('SELECT item_name, variant_name, addons_text, qty, unit, price FROM order_items WHERE order_id = ? ORDER BY id');
        $itemStmt->execute([$id]);
        $items = $itemStmt->fetchAll();
        foreach ($items as &$it) {
            $it['price'] = (float)$it['price'];
        }
        unset($it);
        $order['total_estimate'] = (float)$order['total_estimate'];
        $order['subtotal']  = (float)$order['subtotal'];
        $order['cgst']      = (float)$order['cgst'];
        $order['sgst']      = (float)$order['sgst'];
        $order['gst_rate']  = (float)$order['gst_rate'];
        $order['customer_id'] = $order['customer_id'] !== null ? (int)$order['customer_id'] : null;

        // Customer profile (if linked).
        $customer = null;
        if ($order['customer_id']) {
            $cstmt = db()->prepare('SELECT id, name, phone, email, pin_hash IS NOT NULL AS has_pin, created_at FROM customers WHERE id = ?');
            $cstmt->execute([$order['customer_id']]);
            if ($c = $cstmt->fetch()) {
                $customer = [
                    'id'      => (int)$c['id'],
                    'name'    => $c['name'],
                    'phone'   => $c['phone'],
                    'email'   => $c['email'],
                    'has_pin' => (bool)$c['has_pin'],
                ];
            }
        }
        $order['items'] = $items;
        $order['customer'] = $customer;
        Response::json(['order' => $order]);
    }

    // --- update status (with customer push) ---
    if ($action === 'update_status' && $method === 'POST') {
        require_csrf_api($_POST);
        $id = (int)($parts[3] ?? 0);
        $status = (string)($_POST['status'] ?? '');
        $valid = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
        if (!in_array($status, $valid, true)) {
            Response::error('Invalid status.');
        }
        // Delivery riders can only mark an order Delivered — nothing else.
        if ((string)($admin['role'] ?? 'staff') === 'rider' && $status !== 'delivered') {
            json_error('Delivery riders can only mark orders as Delivered.', 403);
        }
        $stmt = db()->prepare('SELECT id, customer_id, status FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $id]);

        // Notify the customer's devices (no-op if push not configured or no subscriptions).
        $pushSent = 0;
        if ((int)$order['customer_id'] > 0 && $status !== $order['status']) {
            $cfg = config();
            [$pushSent] = push_send_to_customer(
                (int)$order['customer_id'],
                'Order #' . $id . ' — ' . status_label($status),
                admin_status_push_body($status),
                $cfg['base_url'] . '/account'
            );
        }
        Response::json(['ok' => true, 'status' => $status, 'push_sent' => (int)$pushSent]);
    }

    Response::error('Method not allowed', 405);
}

/** Friendly push body per status, mirroring the old admin orders page. */
function admin_status_push_body(string $status): string
{
    return match ($status) {
        'confirmed'        => "We've confirmed your order and will start cooking soon.",
        'preparing'        => 'Your food is being freshly prepared now.',
        'out_for_delivery' => 'Your order is on the way to you!',
        'delivered'        => 'Your order has been delivered. Enjoy your meal!',
        'cancelled'        => 'Your order was cancelled. Please call us if you have questions.',
        default            => 'Your order status was updated.',
    };
}
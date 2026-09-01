<?php
/* GET  /api/admin/orders                  — recent orders (limit 200) with item_count.
   GET  /api/admin/orders/show/{id}        — full order + items + customer.
   POST /api/admin/orders/update_status/{id} — change status; pushes the customer on change.
   GET  /api/admin/orders/lookup_customer  ?phone= → known customer + last address.
   POST /api/admin/orders/create           — counter order entry (cap: new_order).
   The VKADMIN session is started by api/index.php; every action requires an admin. */
require_once __DIR__ . '/../../../includes/push.php';
require_once __DIR__ . '/../../../includes/settings.php';
require_once __DIR__ . '/../../../includes/gst.php';
require_once __DIR__ . '/../../../includes/order_lines.php';
require_once __DIR__ . '/../../../includes/order_events.php';

/* Resolve posted cart lines into priced order lines. Prices, variant deltas and
   add-on prices are ALWAYS re-read from the DB — the client sends ids and
   quantities only, never money. Shared by create and update so a counter edit
   is priced by exactly the same rules as the original order.
   Returns [$lines, $subtotal]; Response::error()s on an unchosen variant. */
function resolve_order_lines(PDO $pdo, array $items): array
{
    $lines = [];
    $total = 0.0;
    $itemStmt    = $pdo->prepare('SELECT name, price, unit FROM menu_items WHERE id = ? AND available = 1');
    $variantStmt = $pdo->prepare('SELECT id, name, price_delta FROM menu_item_variants WHERE item_id = ? ORDER BY sort_order, id');
    $addonStmt   = $pdo->prepare('SELECT id, name, price FROM menu_item_addons WHERE item_id = ? AND available = 1');

    foreach ($items as $it) {
        $id  = (int)($it['id'] ?? 0);
        $qty = (int)($it['qty'] ?? 0);
        if ($id <= 0 || $qty <= 0 || $qty > 999) {
            continue;
        }
        $itemStmt->execute([$id]);
        $menuItem = $itemStmt->fetch();
        if (!$menuItem) {
            continue;
        }
        $unit = (float)$menuItem['price'];

        $variantStmt->execute([$id]);
        $itemVariants = $variantStmt->fetchAll();
        $variantId   = (int)($it['variant_id'] ?? 0);
        $variantName = null;
        if ($itemVariants) {
            $chosen = null;
            foreach ($itemVariants as $v) {
                if ((int)$v['id'] === $variantId) { $chosen = $v; break; }
            }
            if (!$chosen) {
                Response::error('Please choose a size for ' . $menuItem['name'] . '.');
            }
            $unit += (float)$chosen['price_delta'];
            $variantName = $chosen['name'];
        }

        $addonNames = [];
        $chosenAddonIds = [];
        $addonIds = $it['addon_ids'] ?? [];
        if (is_array($addonIds) && $addonIds) {
            $addonStmt->execute([$id]);
            $valid = [];
            foreach ($addonStmt->fetchAll() as $a) {
                $valid[(int)$a['id']] = $a;
            }
            foreach ($addonIds as $aid) {
                $aid = (int)$aid;
                if (isset($valid[$aid])) {
                    $unit += (float)$valid[$aid]['price'];
                    $addonNames[] = $valid[$aid]['name'];
                    $chosenAddonIds[] = $aid;
                }
            }
        }

        $lines[] = [
            'name'         => $menuItem['name'],
            'unit'         => $menuItem['unit'],
            'price'        => $unit,
            'qty'          => $qty,
            'variant_name' => $variantName,
            'addons_text'  => $addonNames ? implode(', ', $addonNames) : null,
            'menu_item_id' => $id,
            'variant_id'   => $variantId ?: null,
            'addon_ids'    => $chosenAddonIds ? implode(',', $chosenAddonIds) : null,
        ];
        $total += $unit * $qty;
    }
    return [$lines, $total];
}

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
                    o.discount_pct, o.discount_amount, o.delivery_charge, o.is_complimentary,
                    o.cancel_acked_at, o.cancel_acked_label, o.cancel_requested_at, o.cancel_requested_label,
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
            $o['discount_pct']     = (float)$o['discount_pct'];
            $o['discount_amount']  = (float)$o['discount_amount'];
            $o['delivery_charge']  = (float)$o['delivery_charge'];
            $o['is_complimentary'] = (bool)$o['is_complimentary'];
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
                    o.subtotal, o.discount_pct, o.discount_amount, o.cgst, o.sgst,
                    o.delivery_charge, o.is_complimentary, o.total_estimate,
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
                       'item_count', 'subtotal', 'discount_pct', 'discount_amount',
                       'cgst', 'sgst', 'delivery_charge', 'complimentary', 'total',
                       'address', 'branch']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['id'], $r['created_at'], $r['needed_on'], $r['name'], $r['phone'], $r['status'],
                (int)$r['item_count'], (float)$r['subtotal'],
                (float)$r['discount_pct'], (float)$r['discount_amount'],
                (float)$r['cgst'], (float)$r['sgst'], (float)$r['delivery_charge'],
                (int)$r['is_complimentary'] ? 'yes' : 'no',
                (float)$r['total_estimate'], $r['address_text'] ?? '', $r['branch_name'] ?? '',
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
                    o.cancel_acked_at, o.cancel_acked_label, o.cancel_requested_at, o.cancel_requested_label,
                    o.discount_pct, o.discount_amount, o.delivery_charge, o.is_complimentary,
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
        // menu ids come back too, so the edit screen rebuilds each line exactly
        // rather than matching on name (migration_007; NULL on pre-007 orders).
        $itemStmt = db()->prepare(
            'SELECT menu_item_id, variant_id, addon_ids, item_name, variant_name, addons_text, qty, unit, price
               FROM order_items WHERE order_id = ? ORDER BY id'
        );
        $itemStmt->execute([$id]);
        $items = $itemStmt->fetchAll();
        foreach ($items as &$it) {
            $it['price'] = (float)$it['price'];
            $it['qty']   = (int)$it['qty'];
            $it['menu_item_id'] = $it['menu_item_id'] !== null ? (int)$it['menu_item_id'] : null;
            $it['variant_id']   = $it['variant_id'] !== null ? (int)$it['variant_id'] : null;
            $it['addon_ids']    = $it['addon_ids'] ? array_map('intval', explode(',', $it['addon_ids'])) : [];
        }
        unset($it);
        $order['total_estimate'] = (float)$order['total_estimate'];
        $order['subtotal']  = (float)$order['subtotal'];
        $order['cgst']      = (float)$order['cgst'];
        $order['sgst']      = (float)$order['sgst'];
        $order['gst_rate']  = (float)$order['gst_rate'];
        $order['discount_pct']     = (float)$order['discount_pct'];
        $order['discount_amount']  = (float)$order['discount_amount'];
        $order['delivery_charge']  = (float)$order['delivery_charge'];
        $order['is_complimentary'] = (bool)$order['is_complimentary'];
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
        $order['events'] = order_events($id);
        Response::json(['order' => $order]);
    }

    // --- known-customer lookup for counter entry (phone → name + last address) ---
    if ($action === 'lookup_customer' && $method === 'GET') {
        require_admin_cap('new_order');
        $phone = normalize_phone((string)($_GET['phone'] ?? ''));
        if ($phone === null) {
            Response::json(['customer' => null]);
        }
        $stmt = db()->prepare('SELECT id, name, phone FROM customers WHERE phone = ?');
        $stmt->execute([$phone]);
        $c = $stmt->fetch();
        if (!$c) {
            Response::json(['customer' => null]);
        }
        $astmt = db()->prepare(
            'SELECT address_text FROM addresses WHERE customer_id = ?
              ORDER BY is_default DESC, id DESC LIMIT 1'
        );
        $astmt->execute([(int)$c['id']]);
        $addr = $astmt->fetch();
        Response::json(['customer' => [
            'id'           => (int)$c['id'],
            'name'         => $c['name'],
            'phone'        => $c['phone'],
            'address_text' => $addr ? $addr['address_text'] : null,
        ]]);
    }

    /* --- type-ahead customer search for counter entry ---
       Gated on `new_order`, not `customers`: a rep needs to find a regular
       while taking their order, but has no business in the customer admin.
       Matches name OR phone, because at a counter the rep usually knows the
       person by name and the number is the thing they cannot recall.
       Most recent orderers first — a busy kitchen's regulars are the answer
       far more often than an alphabetical match. */
    if ($action === 'search_customers' && $method === 'GET') {
        require_admin_cap('new_order');
        $q = trim((string)($_GET['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            Response::json(['customers' => []]);
        }
        // Digits typed into the phone box are matched against the stored
        // 91XXXXXXXXXX form, so "98765" finds +91 98765 43210.
        $digits = preg_replace('/\D+/', '', $q);
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $phoneLike = $digits !== '' ? '%' . $digits . '%' : null;

        $sql = 'SELECT c.id, c.name, c.phone,
                       (SELECT a.address_text FROM addresses a
                         WHERE a.customer_id = c.id
                         ORDER BY a.is_default DESC, a.id DESC LIMIT 1) AS address_text
                  FROM customers c
                 WHERE c.name LIKE ?';
        $args = [$like];
        if ($phoneLike !== null) {
            $sql .= ' OR c.phone LIKE ?';
            $args[] = $phoneLike;
        }
        $sql .= ' ORDER BY c.last_order_at IS NULL, c.last_order_at DESC, c.id DESC LIMIT 8';
        $stmt = db()->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['id'] = (int)$r['id'];
        }
        unset($r);
        Response::json(['customers' => $rows]);
    }

    // --- one-time claim link for a counter customer ---
    // Returns the raw token; the caller builds the URL from its own origin, so
    // the link always points at the app the rep is actually looking at.
    if ($action === 'claim_link' && $method === 'POST') {
        require_admin_cap('new_order');
        require_csrf_api($_POST);
        $id = (int)($parts[3] ?? 0);
        $stmt = db()->prepare('SELECT customer_id, name, phone FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        $customerId = (int)($order['customer_id'] ?? 0);
        if ($customerId <= 0) {
            Response::error('This order is not linked to a customer.');
        }
        $cstmt = db()->prepare('SELECT pin_hash FROM customers WHERE id = ?');
        $cstmt->execute([$customerId]);
        $customer = $cstmt->fetch();
        Response::json([
            'token'   => issue_claim_token($customerId),
            'phone'   => $order['phone'],
            'name'    => $order['name'],
            'has_pin' => $customer ? $customer['pin_hash'] !== null : false,
            'days'    => CLAIM_TOKEN_DAYS,
        ]);
    }

    // --- counter order entry ---
    // Mirrors orders.php::create (prices are always re-read from the DB, never
    // trusted from the client) but runs on the admin session and lands the order
    // as `confirmed`: the rep has the customer in front of them, so there is
    // nothing left to confirm by phone.
    if ($action === 'create' && $method === 'POST') {
        require_admin_cap('new_order');
        require_csrf_api($_POST);

        $name = trim((string)($_POST['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            Response::error('Please write the customer name.');
        }
        $phone = normalize_phone((string)($_POST['phone'] ?? ''));
        if ($phone === null) {
            Response::error('Please write a 10-digit phone number.');
        }
        $neededOn = trim((string)($_POST['needed_on'] ?? ''));
        if ($neededOn === '' || mb_strlen($neededOn) > 160) {
            Response::error('Please set when the food is needed.');
        }
        $items = $_POST['items'] ?? [];
        if (!is_array($items) || count($items) === 0 || count($items) > 100) {
            Response::error('Please add at least one dish.');
        }
        $notes       = mb_substr(trim((string)($_POST['notes'] ?? '')), 0, 2000);
        $addressText = mb_substr(trim((string)($_POST['address_text'] ?? '')), 0, 2000);

        // Counter billing adjustments (migration_006). Clamped here as well as
        // in compute_order_total so a bad client can never bill a negative.
        $discountPct    = min(100.0, max(0.0, (float)($_POST['discount_pct'] ?? 0)));
        $deliveryCharge = max(0.0, (float)($_POST['delivery_charge'] ?? 0));
        $isComplimentary = !empty($_POST['is_complimentary']);

        $pdo = db();
        [$lines, $total] = resolve_order_lines($pdo, $items);
        if (!$lines) {
            Response::error('Please add at least one dish.');
        }

        $bill = compute_order_total(
            $total,
            (float)setting('gst_rate', '0'),
            $discountPct,
            $deliveryCharge,
            $isComplimentary
        );
        $branchId = config()['default_branch_id'] ?? 1;

        $pdo->beginTransaction();
        try {
            $customerId = upsert_customer($name, $phone);

            if ($addressText !== '') {
                $stmt = $pdo->prepare('SELECT id FROM addresses WHERE customer_id = ? AND address_text = ?');
                $stmt->execute([$customerId, $addressText]);
                if (!$stmt->fetch()) {
                    $countStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM addresses WHERE customer_id = ?');
                    $countStmt->execute([$customerId]);
                    $isFirst = (int)$countStmt->fetch()['c'] === 0;
                    $pdo->prepare(
                        'INSERT INTO addresses (customer_id, label, address_text, lat, lng, is_default)
                         VALUES (?, ?, ?, NULL, NULL, ?)'
                    )->execute([$customerId, $isFirst ? 'Home' : 'Saved address', $addressText, $isFirst ? 1 : 0]);
                }
            }

            $pdo->prepare(
                'INSERT INTO orders (customer_id, name, phone, needed_on, address_text, notes,
                                     total_estimate, subtotal, cgst, sgst, gst_rate,
                                     discount_pct, discount_amount, delivery_charge, is_complimentary,
                                     branch_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$customerId, $name, $phone, $neededOn, $addressText ?: null, $notes ?: null,
                        $bill['total'], $bill['subtotal'], $bill['cgst'], $bill['sgst'], $bill['rate'],
                        $bill['discount_pct'], $bill['discount_amount'], $bill['delivery_charge'],
                        $bill['complimentary'] ? 1 : 0,
                        $branchId, 'confirmed']);
            $orderId = (int)$pdo->lastInsertId();

            insert_order_lines($pdo, $orderId, $lines);
            log_order_event($orderId, 'admin', (int)$admin['id'], (string)$admin['username'], 'created', [
                'total' => $bill['total'], 'items' => count($lines), 'channel' => 'counter',
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('admin orders/create failed: ' . $e->getMessage());
            Response::error('Could not save the order. Please try again.', 500);
        }

        Response::json([
            'order_id'      => $orderId,
            'total'         => $bill['total'],
            'complimentary' => $bill['complimentary'],
        ]);
    }

    /* --- edit an existing order (cap: new_order) ---
       Everything a counter order carries: contact, delivery, notes, the dishes
       themselves and the billing adjustments. Prices are re-resolved from the
       menu through the same helper `create` uses, so an edited bill is priced by
       identical rules, and the GST breakdown is re-snapshotted onto the order.

       Terminal orders are refused. `delivered` is a settled GST invoice and
       `cancelled` is void — silently rewriting either is almost always a
       mistake, and neither is what "edit the order" means at a counter. */
    if ($action === 'update' && $method === 'POST') {
        require_admin_cap('new_order');
        require_csrf_api($_POST);
        $id = (int)($parts[3] ?? 0);

        $pdo = db();
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Order not found.', 404);
        }
        if (in_array($existing['status'], ['delivered', 'cancelled'], true)) {
            Response::error('This order is ' . $existing['status'] . ' and can no longer be edited.');
        }

        $name = trim((string)($_POST['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            Response::error('Please write the customer name.');
        }
        $phone = normalize_phone((string)($_POST['phone'] ?? ''));
        if ($phone === null) {
            Response::error('Please write a 10-digit phone number.');
        }
        $neededOn = trim((string)($_POST['needed_on'] ?? ''));
        if ($neededOn === '' || mb_strlen($neededOn) > 160) {
            Response::error('Please set when the food is needed.');
        }
        $items = $_POST['items'] ?? [];
        if (!is_array($items) || count($items) === 0 || count($items) > 100) {
            Response::error('Please add at least one dish.');
        }
        $notes       = mb_substr(trim((string)($_POST['notes'] ?? '')), 0, 2000);
        $addressText = mb_substr(trim((string)($_POST['address_text'] ?? '')), 0, 2000);
        $discountPct = min(100.0, max(0.0, (float)($_POST['discount_pct'] ?? 0)));
        $deliveryCharge  = max(0.0, (float)($_POST['delivery_charge'] ?? 0));
        $isComplimentary = !empty($_POST['is_complimentary']);

        [$lines, $subtotal] = resolve_order_lines($pdo, $items);
        if (!$lines) {
            Response::error('Please add at least one dish.');
        }

        // Re-snapshot at the CURRENT gst rate — an edit is a fresh billing
        // decision, so it is priced by today's rules like any other order.
        $bill = compute_order_total($subtotal, (float)setting('gst_rate', '0'),
                                    $discountPct, $deliveryCharge, $isComplimentary);

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE orders SET name = ?, phone = ?, needed_on = ?, address_text = ?, notes = ?,
                                   total_estimate = ?, subtotal = ?, cgst = ?, sgst = ?, gst_rate = ?,
                                   discount_pct = ?, discount_amount = ?, delivery_charge = ?,
                                   is_complimentary = ?
                   WHERE id = ?'
            )->execute([
                $name, $phone, $neededOn, $addressText ?: null, $notes ?: null,
                $bill['total'], $bill['subtotal'], $bill['cgst'], $bill['sgst'], $bill['rate'],
                $bill['discount_pct'], $bill['discount_amount'], $bill['delivery_charge'],
                $bill['complimentary'] ? 1 : 0, $id,
            ]);
            insert_order_lines($pdo, $id, $lines, true);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('admin orders/update failed: ' . $e->getMessage());
            Response::error('Could not save the changes. Please try again.', 500);
        }

        // What actually moved, for the history shown in the drawer.
        $changed = [];
        foreach ([['name', $name], ['phone', $phone], ['needed_on', $neededOn],
                  ['address_text', $addressText ?: null], ['notes', $notes ?: null]] as [$field, $now]) {
            if ((string)$existing[$field] !== (string)$now) {
                $changed[] = $field;
            }
        }
        if ((float)$existing['total_estimate'] !== (float)$bill['total']) {
            $changed[] = 'total';
        }
        log_order_event($id, 'admin', (int)$admin['id'], (string)$admin['username'], 'edited', [
            'changed'    => $changed ?: ['items'],
            'total_from' => (float)$existing['total_estimate'],
            'total_to'   => $bill['total'],
            'items'      => count($lines),
        ]);

        Response::json([
            'ok'       => true,
            'order_id' => $id,
            'total'    => $bill['total'],
            'complimentary' => $bill['complimentary'],
        ]);
    }

    /* --- confirm the kitchen was told about a cancellation ---
       A push can be missed or dismissed; the kitchen is actually informed by a
       person. This records that someone did it, so a cancelled order can stop
       being flagged on the board. Any signed-in role may confirm — whoever is
       nearest the kitchen is the right person, not whoever holds a capability.

       This is ALSO where the customer finally hears about it. Cancelling does
       not notify them (see update_status): telling someone their order is
       cancelled while the kitchen is still cooking it is worse than telling
       them a minute later, so the customer's confirmation waits until a human
       has actually stopped the food. */
    if ($action === 'ack_cancel' && $method === 'POST') {
        require_csrf_api($_POST);
        $id = (int)($parts[3] ?? 0);
        $stmt = db()->prepare(
            'SELECT id, customer_id, status, cancel_acked_at, cancel_requested_at FROM orders WHERE id = ?'
        );
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        $wasRequested = $order['cancel_requested_at'] !== null;
        if ($order['status'] !== 'cancelled' && !$wasRequested) {
            Response::error('This order is not cancelled and no cancellation was requested.');
        }
        if ($order['cancel_acked_at'] !== null) {
            Response::error('Someone has already confirmed this one.');
        }

        /* A customer request is only APPLIED here — this is the moment the
           kitchen has actually stopped, so it is also the moment the order
           really becomes cancelled. A rep-initiated cancellation is already
           cancelled; confirming only records that the kitchen was told. */
        if ($wasRequested && $order['status'] !== 'cancelled') {
            db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute(['cancelled', $id]);
            log_order_event($id, 'admin', (int)$admin['id'], (string)$admin['username'], 'cancelled', [
                'from' => $order['status'], 'via' => 'customer_request',
            ]);
        }
        db()->prepare(
            'UPDATE orders SET cancel_acked_at = NOW(), cancel_acked_by = ?, cancel_acked_label = ?
              WHERE id = ?'
        )->execute([(int)$admin['id'], (string)$admin['username'], $id]);
        log_order_event($id, 'admin', (int)$admin['id'], (string)$admin['username'], 'kitchen_informed', []);

        // Now — and only now — tell the customer.
        $pushSent = 0;
        if ((int)$order['customer_id'] > 0) {
            [$pushSent] = push_send_to_customer(
                (int)$order['customer_id'],
                'Order #' . $id . ' cancelled',
                admin_status_push_body('cancelled'),
                '/account'
            );
        }

        Response::json([
            'ok' => true,
            'acked_by' => (string)$admin['username'],
            'customer_notified' => (int)$pushSent,
        ]);
    }

    /* --- decline a cancellation request ---
       The kitchen may already have cooked it. Without this, a request has only
       one possible outcome, which makes it a delay rather than a request, and a
       rep who cannot say no simply never clicks — leaving it pending forever. */
    if ($action === 'reject_cancel' && $method === 'POST') {
        require_csrf_api($_POST);
        $id = (int)($parts[3] ?? 0);
        $reason = mb_substr(trim((string)($_POST['reason'] ?? '')), 0, 200);
        $stmt = db()->prepare('SELECT id, customer_id, status, cancel_requested_at FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        if ($order['cancel_requested_at'] === null) {
            Response::error('There is no cancellation request on this order.');
        }
        if ($order['status'] === 'cancelled') {
            Response::error('This order is already cancelled.');
        }
        db()->prepare(
            'UPDATE orders SET cancel_requested_at = NULL, cancel_requested_by = NULL,
                               cancel_requested_label = NULL
              WHERE id = ?'
        )->execute([$id]);
        log_order_event($id, 'admin', (int)$admin['id'], (string)$admin['username'], 'cancel_declined',
            $reason !== '' ? ['reason' => $reason] : []);

        $pushSent = 0;
        if ((int)$order['customer_id'] > 0) {
            [$pushSent] = push_send_to_customer(
                (int)$order['customer_id'],
                'Order #' . $id . ' could not be cancelled',
                $reason !== '' ? $reason : 'Your food is already being prepared. Please call us and we will help.',
                '/account'
            );
        }
        Response::json(['ok' => true, 'customer_notified' => (int)$pushSent]);
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
        log_order_event($id, 'admin', (int)$admin['id'], (string)$admin['username'],
            $status === 'cancelled' ? 'cancelled' : 'status',
            ['from' => $order['status'], 'to' => $status]);

        // A cancellation has to reach the kitchen. Alert the other staff
        // devices — not the rep who just did it, who already knows.
        $staffNotified = 0;
        if ($status === 'cancelled' && $order['status'] !== 'cancelled') {
            [$staffNotified] = push_send_to_admins(
                'Order #' . $id . ' cancelled',
                'Cancelled by ' . $admin['username'] . '. Please make sure the kitchen knows.',
                '/admin/orders',
                (int)$admin['id']
            );
        }

        /* Notify the customer's devices (no-op if push not configured or no
           subscriptions). Cancellation is the exception: that message is held
           until a rep confirms the kitchen was told (see ack_cancel), so the
           customer is never told the food stopped while it is still cooking. */
        $pushSent = 0;
        if ((int)$order['customer_id'] > 0 && $status !== $order['status'] && $status !== 'cancelled') {
            [$pushSent] = push_send_to_customer(
                (int)$order['customer_id'],
                'Order #' . $id . ' — ' . status_label($status),
                admin_status_push_body($status),
                '/account'
            );
        }
        Response::json([
            'ok' => true, 'status' => $status,
            'push_sent' => (int)$pushSent, 'staff_notified' => (int)$staffNotified,
        ]);
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
<?php
/* POST /api/orders/create        — place an order (guest ok). Ports api/place-order.php.
   GET  /api/orders               — list the current customer's last 20 orders + items.
   GET  /api/orders/show/{id}     — one owned order + items. */
require_once __DIR__ . '/../../includes/settings.php';
require_once __DIR__ . '/../../includes/gst.php';

function route($method, $action, $parts): void
{
    $branchId = config()['default_branch_id'] ?? 1;

    // --- create ---
    if ($action === 'create') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }
        customer_session_start();
        require_csrf_api($_POST);

        $name = trim((string)($_POST['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            Response::error('Please write your name.');
        }
        $phone = normalize_phone((string)($_POST['phone'] ?? ''));
        if ($phone === null) {
            Response::error('Please write a 10-digit phone number.');
        }
        $neededOn = trim((string)($_POST['needed_on'] ?? ''));
        if ($neededOn === '' || mb_strlen($neededOn) > 160) {
            Response::error('Please tell us when you need the food.');
        }
        $items = $_POST['items'] ?? [];
        if (!is_array($items) || count($items) === 0 || count($items) > 100) {
            Response::error('Please choose at least one dish.');
        }
        $occasion = mb_substr(trim((string)($_POST['occasion'] ?? '')), 0, 60);
        $notes    = mb_substr(trim((string)($_POST['notes'] ?? '')), 0, 2000);
        $lat = is_numeric($_POST['lat'] ?? null) ? (float)$_POST['lat'] : null;
        $lng = is_numeric($_POST['lng'] ?? null) ? (float)$_POST['lng'] : null;

        // Re-read prices from the DB — never trust the client. The charged unit
        // price = base + chosen variant delta + sum of chosen add-on prices; the
        // variant name + add-on names are snapshotted alongside the line.
        $pdo = db();
        $lines = [];
        $total = 0.0;
        $itemStmt = $pdo->prepare('SELECT name, price, unit FROM menu_items WHERE id = ? AND available = 1');
        $variantStmt = $pdo->prepare('SELECT id, name, price_delta FROM menu_item_variants WHERE item_id = ? ORDER BY sort_order, id');
        $addonStmt = $pdo->prepare('SELECT id, name, price FROM menu_item_addons WHERE item_id = ? AND available = 1');
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
            $base = (float)$menuItem['price'];

            // Variants: if the item has any, a valid variant_id is required.
            $variantStmt->execute([$id]);
            $itemVariants = $variantStmt->fetchAll();
            $variantId = (int)($it['variant_id'] ?? 0);
            $variantName = null;
            $unit = $base;
            if ($itemVariants) {
                $chosen = null;
                if ($variantId > 0) {
                    foreach ($itemVariants as $v) {
                        if ((int)$v['id'] === $variantId) { $chosen = $v; break; }
                    }
                }
                if (!$chosen) {
                    Response::error('Please choose a size for ' . $menuItem['name'] . '.');
                }
                $unit = $base + (float)$chosen['price_delta'];
                $variantName = $chosen['name'];
            }

            // Add-ons: optional, multi-select; each must belong to the item & be available.
            $addonNames = [];
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
                    }
                }
            }

            $lines[] = [
                'name' => $menuItem['name'],
                'unit' => $menuItem['unit'],
                'price' => $unit,
                'qty' => $qty,
                'variant_name' => $variantName,
                'addons_text' => $addonNames ? implode(', ', $addonNames) : null,
            ];
            $total += $unit * $qty;
        }
        if (!$lines) {
            Response::error('Please choose at least one dish.');
        }

        // Tax-exclusive GST snapshot — the breakdown is frozen on the order so
        // editing the rate later never changes a past bill. Menu prices are
        // pre-tax; the customer pays the grand total (total_estimate).
        $gst = compute_gst($total, (float)setting('gst_rate', '0'));

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $customerId = upsert_customer($name, $phone);

            $addressText = '';
            if (!empty($_POST['address_id'])) {
                $stmt = $pdo->prepare('SELECT * FROM addresses WHERE id = ? AND customer_id = ?');
                $stmt->execute([(int)$_POST['address_id'], $customerId]);
                if ($addr = $stmt->fetch()) {
                    $addressText = $addr['address_text'];
                    $lat = $addr['lat'] !== null ? (float)$addr['lat'] : $lat;
                    $lng = $addr['lng'] !== null ? (float)$addr['lng'] : $lng;
                }
            } else {
                $addressText = mb_substr(trim((string)($_POST['address_text'] ?? '')), 0, 2000);
                if ($addressText !== '') {
                    $stmt = $pdo->prepare('SELECT id FROM addresses WHERE customer_id = ? AND address_text = ?');
                    $stmt->execute([$customerId, $addressText]);
                    if (!$stmt->fetch()) {
                        $countStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM addresses WHERE customer_id = ?');
                        $countStmt->execute([$customerId]);
                        $isFirst = (int)$countStmt->fetch()['c'] === 0;
                        $pdo->prepare(
                            'INSERT INTO addresses (customer_id, label, address_text, lat, lng, is_default)
                             VALUES (?, ?, ?, ?, ?, ?)'
                        )->execute([$customerId, $isFirst ? 'Home' : 'Saved address',
                                    $addressText, $lat, $lng, $isFirst ? 1 : 0]);
                    }
                }
            }

            $pdo->prepare(
                'INSERT INTO orders (customer_id, name, phone, occasion, needed_on,
                                     address_text, lat, lng, notes,
                                     total_estimate, subtotal, cgst, sgst, gst_rate, branch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$customerId, $name, $phone, $occasion ?: null, $neededOn,
                        $addressText ?: null, $lat, $lng, $notes ?: null,
                        $gst['total'], $gst['subtotal'], $gst['cgst'], $gst['sgst'], $gst['rate'], $branchId]);
            $orderId = (int)$pdo->lastInsertId();

            $lineStmt = $pdo->prepare(
                'INSERT INTO order_items (order_id, item_name, variant_name, addons_text, unit, price, qty)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($lines as $line) {
                $lineStmt->execute([
                    $orderId, $line['name'], $line['variant_name'], $line['addons_text'],
                    $line['unit'], $line['price'], $line['qty'],
                ]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('orders/create failed: ' . $e->getMessage());
            Response::error('Something went wrong saving your order. Please try again or call us.', 500);
        }

        login_customer($customerId);
        Response::json(['order_id' => $orderId]);
    }

    // --- list ---
    if ($action === 'index' && $method === 'GET') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }
        $stmt = db()->prepare(
            'SELECT o.id, o.occasion, o.needed_on, o.address_text, o.status,
                    o.total_estimate, o.subtotal, o.cgst, o.sgst, o.gst_rate,
                    o.discount_pct, o.discount_amount, o.delivery_charge, o.is_complimentary,
                    o.created_at, b.name AS branch_name
               FROM orders o
               LEFT JOIN branches b ON b.id = o.branch_id
              WHERE o.customer_id = ?
              ORDER BY o.id DESC LIMIT 20'
        );
        $stmt->execute([$customer['id']]);
        $orders = $stmt->fetchAll();

        $itemStmt = db()->prepare('SELECT item_name, variant_name, addons_text, qty, unit, price FROM order_items WHERE order_id = ? ORDER BY id');
        foreach ($orders as &$o) {
            $itemStmt->execute([$o['id']]);
            $o['items'] = $itemStmt->fetchAll();
            $o['total_estimate'] = (float)$o['total_estimate'];
            $o['subtotal']  = (float)$o['subtotal'];
            $o['cgst']      = (float)$o['cgst'];
            $o['sgst']      = (float)$o['sgst'];
            $o['gst_rate']  = (float)$o['gst_rate'];
            $o['discount_pct']     = (float)$o['discount_pct'];
            $o['discount_amount']  = (float)$o['discount_amount'];
            $o['delivery_charge']  = (float)$o['delivery_charge'];
            $o['is_complimentary'] = (bool)$o['is_complimentary'];
            foreach ($o['items'] as &$it) {
                $it['price'] = (float)$it['price'];
            }
        }
        unset($o, $it);

        Response::json(['orders' => $orders]);
    }

    // --- show ---
    if ($action === 'show' && $method === 'GET') {
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }
        $id = (int)($parts[2] ?? 0);
        $stmt = db()->prepare(
            'SELECT o.id, o.name, o.phone, o.occasion, o.needed_on, o.address_text,
                    o.lat, o.lng, o.notes, o.status, o.total_estimate,
                    o.subtotal, o.cgst, o.sgst, o.gst_rate,
                    o.discount_pct, o.discount_amount, o.delivery_charge, o.is_complimentary,
                    o.created_at, b.name AS branch_name
               FROM orders o
               LEFT JOIN branches b ON b.id = o.branch_id
              WHERE o.id = ? AND o.customer_id = ?'
        );
        $stmt->execute([$id, $customer['id']]);
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
        $order['subtotal'] = (float)$order['subtotal'];
        $order['cgst']     = (float)$order['cgst'];
        $order['sgst']     = (float)$order['sgst'];
        $order['gst_rate'] = (float)$order['gst_rate'];
        $order['discount_pct']     = (float)$order['discount_pct'];
        $order['discount_amount']  = (float)$order['discount_amount'];
        $order['delivery_charge']  = (float)$order['delivery_charge'];
        $order['is_complimentary'] = (bool)$order['is_complimentary'];
        $order['items'] = $items;
        Response::json(['order' => $order]);
    }

    Response::error('Method not allowed', 405);
}
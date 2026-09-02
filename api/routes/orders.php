<?php
/* POST /api/orders/create        — place an order (guest ok). Ports api/place-order.php.
   GET  /api/orders               — list the current customer's last 20 orders + items.
   GET  /api/orders/show/{id}     — one owned order + items. */
require_once __DIR__ . '/../../includes/settings.php';
require_once __DIR__ . '/../../includes/gst.php';
require_once __DIR__ . '/../../includes/order_lines.php';
require_once __DIR__ . '/../../includes/order_events.php';
require_once __DIR__ . '/../../includes/push.php';
require_once __DIR__ . '/../../includes/hours.php';

/* How long a customer may cancel their own order unaided. The countdown shown
   on the storefront is only UX — this constant is the authority, checked
   against orders.created_at on the server, so a tampered clock changes nothing. */
const CUSTOMER_CANCEL_SECONDS = 300;

/** Seconds of self-cancel left, 0 once the window closes, the status moves on,
    or a request is already in with the kitchen. */
function cancel_seconds_left(string $status, int $ageSeconds, ?string $requestedAt = null): int
{
    if ($requestedAt !== null) {
        return 0;
    }
    if (!in_array($status, ['new', 'confirmed'], true)) {
        return 0;
    }
    return max(0, CUSTOMER_CANCEL_SECONDS - $ageSeconds);
}

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

        /* Opening hours (migration_010). The client sends the raw datetime
           alongside the free-text needed_on; that raw value is what gets checked
           and stored. A customer may order at any hour — what is constrained is
           WHEN the food is wanted, so an off-hours visitor simply picks a slot
           the kitchen is actually open for. */
        $neededAtRaw = trim((string)($_POST['needed_at'] ?? ''));
        $neededAt = null;
        if ($neededAtRaw !== '') {
            try { $neededAt = new DateTimeImmutable($neededAtRaw); } catch (Throwable $e) { $neededAt = null; }
        }
        if ($neededAt === null) {
            Response::error('Please tell us when you need the food.');
        }
        if (!kitchen_is_open($neededAt)) {
            $next = kitchen_next_open($neededAt);
            Response::error(
                'We are closed at that time. ' .
                ($next ? 'The next slot we can cook for is ' . $next->format('D j M, g:i A') . '.'
                       : 'Please pick a time during our opening hours.')
            );
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
        $itemStmt = $pdo->prepare('SELECT name, price, unit, category_id FROM menu_items WHERE id = ? AND available = 1');
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

            // The dish's section must also be cooking at that hour — Tandoor
            // being an evening service is exactly this check.
            if (!category_is_open((int)$menuItem['category_id'], $neededAt)) {
                Response::error(
                    $menuItem['name'] . ' is not available at that time. ' .
                    'Please pick another slot or remove it from your order.'
                );
            }

            $lines[] = [
                'name' => $menuItem['name'],
                'unit' => $menuItem['unit'],
                'price' => $unit,
                'qty' => $qty,
                'variant_name' => $variantName,
                'addons_text' => $addonNames ? implode(', ', $addonNames) : null,
                // Ids behind the snapshot, so a later edit rebuilds this line
                // exactly instead of matching on name (migration_007).
                'menu_item_id' => $id,
                'variant_id'   => $variantId ?: null,
                'addon_ids'    => $chosenAddonIds ? implode(',', $chosenAddonIds) : null,
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
                'INSERT INTO orders (customer_id, name, phone, occasion, needed_on, needed_at,
                                     address_text, lat, lng, notes,
                                     total_estimate, subtotal, cgst, sgst, gst_rate, branch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$customerId, $name, $phone, $occasion ?: null, $neededOn,
                        $neededAt->format('Y-m-d H:i:s'),
                        $addressText ?: null, $lat, $lng, $notes ?: null,
                        $gst['total'], $gst['subtotal'], $gst['cgst'], $gst['sgst'], $gst['rate'], $branchId]);
            $orderId = (int)$pdo->lastInsertId();

            insert_order_lines($pdo, $orderId, $lines);
            log_order_event($orderId, 'customer', $customerId, $name, 'created', [
                'total' => $gst['total'], 'items' => count($lines), 'channel' => 'storefront',
            ]);
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
                    o.cancel_requested_at,
                    o.cancel_requested_at,
                    o.created_at, b.name AS branch_name,
                    TIMESTAMPDIFF(SECOND, o.created_at, NOW()) AS age_seconds
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
            $o['cancel_seconds_left'] = cancel_seconds_left($o['status'], (int)$o['age_seconds'], $o['cancel_requested_at']);
            unset($o['age_seconds']);
            foreach ($o['items'] as &$it) {
                $it['price'] = (float)$it['price'];
            }
        }
        unset($o, $it);

        Response::json(['orders' => $orders]);
    }

    /* --- cancel (customer, inside the countdown) ---
       Allowed only while the kitchen has not started cooking AND within
       CUSTOMER_CANCEL_SECONDS of placing. After that the customer calls — the
       kitchen may already have committed food to the order. */
    if ($action === 'cancel' && $method === 'POST') {
        customer_session_start();
        require_csrf_api($_POST);
        $customer = current_customer();
        if (!$customer) {
            Response::error('Please sign in first.', 401);
        }
        $id = (int)($parts[2] ?? 0);
        $stmt = db()->prepare(
            'SELECT id, status, created_at, cancel_requested_at,
                    TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
               FROM orders WHERE id = ? AND customer_id = ?'
        );
        $stmt->execute([$id, $customer['id']]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found.', 404);
        }
        if ($order['status'] === 'cancelled') {
            Response::error('This order is already cancelled.');
        }
        if ($order['cancel_requested_at'] !== null) {
            Response::error('We have your cancellation request — the kitchen is confirming it.');
        }
        if (!in_array($order['status'], ['new', 'confirmed'], true)) {
            Response::error('We have already started preparing this order. Please call us and we will help.');
        }
        if ((int)$order['age_seconds'] > CUSTOMER_CANCEL_SECONDS) {
            Response::error('The cancellation window has passed. Please call us and we will help.');
        }

        /* Record a REQUEST — deliberately NOT a cancellation. The kitchen may be
           cooking this right now, so the order keeps its real status until a rep
           confirms. Marking it cancelled here would tell the customer the food
           had stopped while it had not, and would leave the staff confirmation
           with nothing left to decide. */
        db()->prepare(
            'UPDATE orders SET cancel_requested_at = NOW(), cancel_requested_by = ?, cancel_requested_label = ?
              WHERE id = ?'
        )->execute([(int)$customer['id'], (string)$customer['name'], $id]);
        log_order_event($id, 'customer', (int)$customer['id'], $customer['name'], 'cancel_requested', [
            'status' => $order['status'], 'within_seconds' => (int)$order['age_seconds'],
        ]);

        // Alert every staff device — no admin did this, so nobody is excluded.
        [$pushSent] = push_send_to_admins(
            'Cancellation requested — order #' . $id,
            trim(($customer['name'] ?? 'A customer') . ' wants to cancel. Check with the kitchen and confirm.'),
            '/admin/orders'
        );

        Response::json([
            'ok' => true,
            'requested' => true,
            'status' => $order['status'],
            'staff_notified' => (int)$pushSent,
        ]);
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
                    o.cancel_requested_at,
                    o.cancel_requested_at,
                    o.created_at, b.name AS branch_name,
                    TIMESTAMPDIFF(SECOND, o.created_at, NOW()) AS age_seconds
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
        $order['cancel_seconds_left'] = cancel_seconds_left($order['status'], (int)$order['age_seconds'], $order['cancel_requested_at']);
        unset($order['age_seconds']);
        $order['items'] = $items;
        Response::json(['order' => $order]);
    }

    Response::error('Method not allowed', 405);
}
<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

customer_session_start();
$body = read_json_body();
require_csrf_api($body);

// --- Validate, with the same plain-language messages the form shows ---
$name = trim((string)($body['name'] ?? ''));
if ($name === '' || mb_strlen($name) > 120) {
    json_error('Please write your name (Step 2).');
}

$phone = normalize_phone((string)($body['phone'] ?? ''));
if ($phone === null) {
    json_error('Please write a 10-digit phone number (Step 2).');
}

$neededOn = trim((string)($body['needed_on'] ?? ''));
if ($neededOn === '' || mb_strlen($neededOn) > 160) {
    json_error('Please tell us when you need the food (Step 2).');
}

$items = $body['items'] ?? [];
if (!is_array($items) || count($items) === 0 || count($items) > 100) {
    json_error('Please choose at least one dish with the + buttons (Step 1).');
}

$occasion = mb_substr(trim((string)($body['occasion'] ?? '')), 0, 60);
$notes    = mb_substr(trim((string)($body['notes'] ?? '')), 0, 2000);
$lat = is_numeric($body['lat'] ?? null) ? (float)$body['lat'] : null;
$lng = is_numeric($body['lng'] ?? null) ? (float)$body['lng'] : null;

// --- Re-read items from the DB: prices are never trusted from the client ---
$lines = [];
$total = 0.0;
$itemStmt = db()->prepare('SELECT name, price, unit FROM menu_items WHERE id = ? AND available = 1');
foreach ($items as $it) {
    $id  = (int)($it['id'] ?? 0);
    $qty = (int)($it['qty'] ?? 0);
    if ($id <= 0 || $qty <= 0 || $qty > 999) {
        continue;
    }
    $itemStmt->execute([$id]);
    if ($menuItem = $itemStmt->fetch()) {
        $lines[] = ['name' => $menuItem['name'], 'unit' => $menuItem['unit'],
                    'price' => (float)$menuItem['price'], 'qty' => $qty];
        $total += (float)$menuItem['price'] * $qty;
    }
}
if (!$lines) {
    json_error('Please choose at least one dish with the + buttons (Step 1).');
}

$pdo = db();
$pdo->beginTransaction();
try {
    // Auto-registration: every order creates/updates the customer record
    $customerId = upsert_customer($name, $phone);

    // Resolve the delivery address
    $addressText = '';
    if (!empty($body['address_id'])) {
        // A saved address may only be used by the customer who owns it
        $stmt = $pdo->prepare('SELECT * FROM addresses WHERE id = ? AND customer_id = ?');
        $stmt->execute([(int)$body['address_id'], $customerId]);
        if ($addr = $stmt->fetch()) {
            $addressText = $addr['address_text'];
            $lat = $addr['lat'] !== null ? (float)$addr['lat'] : $lat;
            $lng = $addr['lng'] !== null ? (float)$addr['lng'] : $lng;
        }
    } else {
        $addressText = mb_substr(trim((string)($body['address_text'] ?? '')), 0, 2000);
        // Save a freshly typed address to the customer's address book (no duplicates)
        if ($addressText !== '') {
            $stmt = $pdo->prepare(
                'SELECT id FROM addresses WHERE customer_id = ? AND address_text = ?'
            );
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
                             address_text, lat, lng, notes, total_estimate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$customerId, $name, $phone, $occasion ?: null, $neededOn,
                $addressText ?: null, $lat, $lng, $notes ?: null, $total]);
    $orderId = (int)$pdo->lastInsertId();

    $lineStmt = $pdo->prepare(
        'INSERT INTO order_items (order_id, item_name, unit, price, qty) VALUES (?, ?, ?, ?, ?)'
    );
    foreach ($lines as $line) {
        $lineStmt->execute([$orderId, $line['name'], $line['unit'], $line['price'], $line['qty']]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    error_log('place-order failed: ' . $e->getMessage());
    json_error('Something went wrong saving your order. Please try again or call us.', 500);
}

// This device now belongs to this customer (session + remember cookie)
login_customer($customerId);

json_response(['ok' => true, 'order_id' => $orderId]);

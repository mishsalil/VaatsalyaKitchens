<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/csrf.php';

$customer = current_customer();
if (!$customer) {
    json_error('Please sign in first.', 401);
}
$cid = (int)$customer['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = db()->prepare(
        'SELECT id, label, address_text, lat, lng, is_default
           FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id'
    );
    $stmt->execute([$cid]);
    json_response(['ok' => true, 'addresses' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$body = read_json_body();
require_csrf_api($body);
$action = $body['action'] ?? '';

if ($action === 'add') {
    $label = mb_substr(trim((string)($body['label'] ?? '')), 0, 40) ?: 'Home';
    $text  = mb_substr(trim((string)($body['address_text'] ?? '')), 0, 2000);
    if ($text === '') {
        json_error('Please write the address.');
    }
    $lat = is_numeric($body['lat'] ?? null) ? (float)$body['lat'] : null;
    $lng = is_numeric($body['lng'] ?? null) ? (float)$body['lng'] : null;

    $countStmt = db()->prepare('SELECT COUNT(*) AS c FROM addresses WHERE customer_id = ?');
    $countStmt->execute([$cid]);
    $isFirst = (int)$countStmt->fetch()['c'] === 0;

    db()->prepare(
        'INSERT INTO addresses (customer_id, label, address_text, lat, lng, is_default)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$cid, $label, $text, $lat, $lng, $isFirst ? 1 : 0]);
    json_response(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

// Remaining actions operate on one owned address
$addressId = (int)($body['id'] ?? 0);
$own = db()->prepare('SELECT id FROM addresses WHERE id = ? AND customer_id = ?');
$own->execute([$addressId, $cid]);
if (!$own->fetch()) {
    json_error('Address not found.', 404);
}

if ($action === 'delete') {
    db()->prepare('DELETE FROM addresses WHERE id = ?')->execute([$addressId]);
    json_response(['ok' => true]);
}

if ($action === 'set_default') {
    db()->prepare('UPDATE addresses SET is_default = 0 WHERE customer_id = ?')->execute([$cid]);
    db()->prepare('UPDATE addresses SET is_default = 1 WHERE id = ?')->execute([$addressId]);
    json_response(['ok' => true]);
}

json_error('Unknown action.');

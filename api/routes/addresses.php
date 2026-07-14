<?php
/* GET  /api/addresses                 — list the customer's saved addresses.
   POST /api/addresses/add             {label, address_text, lat, lng} → {id}
   POST /api/addresses/delete/{id}
   POST /api/addresses/set_default/{id} */
function route($method, $action, $parts): void
{
    $customer = current_customer();
    if (!$customer) {
        Response::error('Please sign in first.', 401);
    }
    $cid = (int)$customer['id'];

    if ($action === 'index' && $method === 'GET') {
        $stmt = db()->prepare(
            'SELECT id, label, address_text, lat, lng, is_default
               FROM addresses WHERE customer_id = ?
              ORDER BY is_default DESC, id'
        );
        $stmt->execute([$cid]);
        Response::json(['addresses' => $stmt->fetchAll()]);
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    require_csrf_api($_POST);

    if ($action === 'add') {
        $label = mb_substr(trim((string)($_POST['label'] ?? '')), 0, 40) ?: 'Home';
        $text  = mb_substr(trim((string)($_POST['address_text'] ?? '')), 0, 2000);
        if ($text === '') {
            Response::error('Please write the address.');
        }
        $lat = is_numeric($_POST['lat'] ?? null) ? (float)$_POST['lat'] : null;
        $lng = is_numeric($_POST['lng'] ?? null) ? (float)$_POST['lng'] : null;

        $countStmt = db()->prepare('SELECT COUNT(*) AS c FROM addresses WHERE customer_id = ?');
        $countStmt->execute([$cid]);
        $isFirst = (int)$countStmt->fetch()['c'] === 0;

        db()->prepare(
            'INSERT INTO addresses (customer_id, label, address_text, lat, lng, is_default)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$cid, $label, $text, $lat, $lng, $isFirst ? 1 : 0]);
        Response::json(['id' => (int)db()->lastInsertId()]);
    }

    // delete / set_default operate on one owned address
    $addressId = (int)($parts[2] ?? 0);
    $own = db()->prepare('SELECT id FROM addresses WHERE id = ? AND customer_id = ?');
    $own->execute([$addressId, $cid]);
    if (!$own->fetch()) {
        Response::error('Address not found.', 404);
    }

    if ($action === 'delete') {
        db()->prepare('DELETE FROM addresses WHERE id = ?')->execute([$addressId]);
        Response::success('Deleted');
    }
    if ($action === 'set_default') {
        db()->prepare('UPDATE addresses SET is_default = 0 WHERE customer_id = ?')->execute([$cid]);
        db()->prepare('UPDATE addresses SET is_default = 1 WHERE id = ?')->execute([$addressId]);
        Response::success('Default updated');
    }

    Response::error('Unknown action.');
}
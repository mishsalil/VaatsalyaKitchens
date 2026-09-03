<?php
/* Admin-side address management for a customer. Mirrors the customer
   /api/addresses route but scoped by an explicit customer_id in the URL
   (the admin is not "the customer"), with an extra update action.

   GET  /api/admin/addresses/index/{customerId}        → {addresses:[...]}
   POST /api/admin/addresses/add/{customerId}          {label, address_text, lat, lng} → {id}
   POST /api/admin/addresses/update/{id}               {label, address_text, lat, lng}
   POST /api/admin/addresses/delete/{id}
   POST /api/admin/addresses/set_default/{id}           (re-defaults within that address's customer) */
function route($method, $action, $parts): void
{
    require_admin_cap('customers');
    $db = db();

    // list for one customer
    if ($action === 'index' && $method === 'GET') {
        $cid = (int)($parts[3] ?? 0);
        if (!customer_exists($cid)) {
            Response::error('Customer not found.', 404);
        }
        $stmt = $db->prepare(
            'SELECT id, label, address_text, lat, lng, is_default
               FROM addresses WHERE customer_id = ?
              ORDER BY is_default DESC, id'
        );
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$a) {
            $a['is_default'] = (int)$a['is_default'];
        }
        unset($a);
        Response::json(['addresses' => $rows]);
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    if ($action === 'add') {
        $cid = (int)($parts[3] ?? 0);
        if (!customer_exists($cid)) {
            Response::error('Customer not found.', 404);
        }
        [$label, $text, $lat, $lng] = read_address_fields();
        $countStmt = $db->prepare('SELECT COUNT(*) FROM addresses WHERE customer_id = ?');
        $countStmt->execute([$cid]);
        $isFirst = (int)$countStmt->fetchColumn() === 0;
        $db->prepare(
            'INSERT INTO addresses (customer_id, label, address_text, lat, lng, is_default)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$cid, $label, $text, $lat, $lng, $isFirst ? 1 : 0]);
        Response::json(['id' => (int)$db->lastInsertId()]);
    }

    // update / delete / set_default operate on one address (must verify ownership)
    $addressId = (int)($parts[3] ?? 0);
    $own = $db->prepare('SELECT id, customer_id FROM addresses WHERE id = ?');
    $own->execute([$addressId]);
    $addr = $own->fetch();
    if (!$addr) {
        Response::error('Address not found.', 404);
    }
    $ownerId = (int)$addr['customer_id'];

    if ($action === 'update') {
        [$label, $text, $lat, $lng] = read_address_fields();
        $db->prepare('UPDATE addresses SET label = ?, address_text = ?, lat = ?, lng = ? WHERE id = ?')
            ->execute([$label, $text, $lat, $lng, $addressId]);
        Response::success('Updated');
    }

    if ($action === 'delete') {
        $db->prepare('DELETE FROM addresses WHERE id = ?')->execute([$addressId]);
        Response::success('Deleted');
    }

    if ($action === 'set_default') {
        $db->prepare('UPDATE addresses SET is_default = 0 WHERE customer_id = ?')->execute([$ownerId]);
        $db->prepare('UPDATE addresses SET is_default = 1 WHERE id = ?')->execute([$addressId]);
        Response::success('Default updated');
    }

    Response::error('Method not allowed', 405);
}

function customer_exists(int $id): bool
{
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    return (bool)$stmt->fetchColumn();
}

/** Validates + trims the shared address fields. Throws (Response::error) on bad input. */
function read_address_fields(): array
{
    $label = mb_substr(trim((string)($_POST['label'] ?? '')), 0, 40) ?: 'Home';
    $text  = mb_substr(trim((string)($_POST['address_text'] ?? '')), 0, 2000);
    if ($text === '') {
        Response::error('Please write the address.');
    }
    $lat = is_numeric($_POST['lat'] ?? null) ? (float)$_POST['lat'] : null;
    $lng = is_numeric($_POST['lng'] ?? null) ? (float)$_POST['lng'] : null;
    return [$label, $text, $lat, $lng];
}
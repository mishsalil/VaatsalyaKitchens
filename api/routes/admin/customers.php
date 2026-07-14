<?php
/* Admin customer management — list/search, view detail, edit, reset PIN, delete.

   GET  /api/admin/customers              ?q=  → {customers:[...]}
   GET  /api/admin/customers/show/{id}    → {customer, addresses, orders}
   POST /api/admin/customers/update/{id}  {name, phone}
   POST /api/admin/customers/reset_pin/{id}
   POST /api/admin/customers/delete/{id}  (FKs cascade/SET NULL addresses, orders, push, tokens)

   Phone is normalized to 91XXXXXXXXXX server-side (mirrors the customer signup
   route) and uniqueness is enforced at the DB level (uq_customers_phone). */
function route($method, $action, $parts): void
{
    require_admin_cap('customers');
    $db = db();

    // --- list with optional search ---
    if ($action === 'index' && $method === 'GET') {
        $q = trim((string)($_GET['q'] ?? ''));
        $sql =
            'SELECT c.id, c.name, c.phone, c.email, c.pin_hash IS NOT NULL AS has_pin,
                    c.created_at, c.last_order_at,
                    (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders_count
               FROM customers c';
        $args = [];
        if ($q !== '') {
            $sql .= ' WHERE c.name LIKE ? OR c.phone LIKE ?';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $args = [$like, $like];
        }
        $sql .= ' ORDER BY c.id DESC LIMIT 500';
        $stmt = $db->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$c) {
            $c['has_pin'] = (bool)$c['has_pin'];
            $c['orders_count'] = (int)$c['orders_count'];
        }
        unset($c);
        Response::json(['customers' => $rows]);
    }

    // --- full profile (drawer source) ---
    if ($action === 'show' && $method === 'GET') {
        $id = (int)($parts[3] ?? 0);
        $customer = load_customer($id);
        if (!$customer) {
            Response::error('Customer not found.', 404);
        }
        $addrStmt = $db->prepare(
            'SELECT id, label, address_text, lat, lng, is_default
               FROM addresses WHERE customer_id = ?
              ORDER BY is_default DESC, id'
        );
        $addrStmt->execute([$id]);
        $addresses = $addrStmt->fetchAll();
        foreach ($addresses as &$a) {
            $a['is_default'] = (int)$a['is_default'];
        }
        unset($a);

        $ordStmt = $db->prepare(
            'SELECT id, name, phone, needed_on, status, total_estimate, created_at
               FROM orders WHERE customer_id = ?
              ORDER BY id DESC LIMIT 50'
        );
        $ordStmt->execute([$id]);
        $orders = $ordStmt->fetchAll();
        foreach ($orders as &$o) {
            $o['total_estimate'] = (float)$o['total_estimate'];
        }
        unset($o);

        Response::json(['customer' => $customer, 'addresses' => $addresses, 'orders' => $orders]);
    }

    // --- export all customers as CSV (read-only) ---
    if ($action === 'export' && $method === 'GET') {
        $rows = $db->query(
            'SELECT c.id, c.name, c.phone, c.email, c.pin_hash IS NOT NULL AS has_pin,
                    c.created_at,
                    (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders_count
               FROM customers c
              ORDER BY c.id'
        )->fetchAll();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="vaatsalya-customers.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'name', 'phone', 'email', 'has_pin', 'orders_count', 'created_at']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['id'], $r['name'], $r['phone'], $r['email'] ?? '',
                (int)$r['has_pin'] ? 'yes' : 'no', (int)$r['orders_count'], $r['created_at'],
            ]);
        }
        fclose($out);
        exit;
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    require_csrf_api($_POST);

    // --- import customers from CSV (columns: name,phone,email) ---
    if ($action === 'import') {
        $csv = read_uploaded_csv('file');
        $created = 0;
        $skipped = 0;
        $errors = [];
        $ins = $db->prepare('INSERT IGNORE INTO customers (name, phone, email, pin_hash) VALUES (?, ?, ?, NULL)');
        $dupStmt = $db->prepare('SELECT 1 FROM customers WHERE phone = ?');
        $rowNum = 1; // header is row 0
        foreach ($csv as $row) {
            $rowNum++;
            $name  = mb_substr(trim((string)($row[0] ?? '')), 0, 120);
            $phone = normalize_phone_admin((string)($row[1] ?? ''));
            $email = mb_substr(trim((string)($row[2] ?? '')), 0, 190);
            if ($name === '') {
                $errors[] = ['row' => $rowNum, 'msg' => 'Missing name.'];
                continue;
            }
            if ($phone === null) {
                $errors[] = ['row' => $rowNum, 'msg' => 'Invalid phone (need 10 digits).'];
                continue;
            }
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors[] = ['row' => $rowNum, 'msg' => 'Invalid email — skipped.'];
                continue;
            }
            $dupStmt->execute([$phone]);
            if ($dupStmt->fetch()) {
                $skipped++; // never overwrite a real record on import
                continue;
            }
            $ins->execute([$name, $phone, $email]);
            $created++;
        }
        Response::json(['ok' => true, 'created' => $created, 'skipped' => $skipped, 'errors' => $errors]);
    }

    if ($action === 'update') {
        $id = (int)($parts[3] ?? 0);
        $customer = load_customer($id);
        if (!$customer) {
            Response::error('Customer not found.', 404);
        }
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 120);
        if ($name === '') {
            Response::error('Please enter a name.');
        }
        $phone = normalize_phone_admin($_POST['phone'] ?? '');
        if ($phone === null) {
            Response::error('Please enter a valid 10-digit mobile number.');
        }
        // uniqueness excluding self
        $dup = $db->prepare('SELECT 1 FROM customers WHERE phone = ? AND id <> ?');
        $dup->execute([$phone, $id]);
        if ($dup->fetch()) {
            Response::error('That phone number is already used by another customer.');
        }
        $db->prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?')
            ->execute([$name, $phone, $id]);
        Response::success('Updated');
    }

    if ($action === 'reset_pin') {
        $id = (int)($parts[3] ?? 0);
        if (!load_customer($id)) {
            Response::error('Customer not found.', 404);
        }
        $db->prepare('UPDATE customers SET pin_hash = NULL WHERE id = ?')->execute([$id]);
        Response::success('PIN reset');
    }

    if ($action === 'delete') {
        $id = (int)($parts[3] ?? 0);
        if (!load_customer($id)) {
            Response::error('Customer not found.', 404);
        }
        // addresses CASCADE, orders/push SET NULL, tokens CASCADE — all by FK.
        $db->prepare('DELETE FROM customers WHERE id = ?')->execute([$id]);
        Response::success('Deleted');
    }

    Response::error('Method not allowed', 405);
}

function load_customer(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT id, name, phone, email, pin_hash IS NOT NULL AS has_pin, created_at, last_order_at
           FROM customers WHERE id = ?'
    );
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    if (!$c) {
        return null;
    }
    $c['has_pin'] = (bool)$c['has_pin'];
    return $c;
}

/** 10-digit → 91XXXXXXXXXX; 12-digit already-91 stays; 11-digit leading 0 → 91... */
function normalize_phone_admin(string $v): ?string
{
    $d = preg_replace('/\D/', '', $v);
    if (strlen($d) === 10) {
        $d = '91' . $d;
    } elseif (strlen($d) === 11 && str_starts_with($d, '0')) {
        $d = '91' . substr($d, 1);
    }
    return (strlen($d) === 12 && str_starts_with($d, '91')) ? $d : null;
}

/**
 * Read an uploaded CSV file (multipart field $field) into an array of rows,
 * each row an array of string cells. The first row is treated as a header and
 * dropped. Empty trailing lines are ignored. Throws a 400 JSON error on any
 * upload problem so callers can just iterate.
 */
function read_uploaded_csv(string $field): array
{
    if (empty($_FILES[$field]) || ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        Response::error('Please choose a CSV file.');
    }
    $f = $_FILES[$field];
    if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        Response::error('Upload failed. Please try a smaller file.');
    }
    if ($f['size'] > 5 * 1024 * 1024) {
        Response::error('CSV must be 5 MB or smaller.');
    }
    $text = file_get_contents($f['tmp_name']);
    if ($text === false || trim($text) === '') {
        Response::error('The CSV file is empty.');
    }
    // Normalize line endings then split — str_getcsv parses one record at a time.
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $lines = explode("\n", $text);
    $rows = [];
    $first = true;
    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }
        if ($first) {
            $first = false;
            continue; // header
        }
        $rows[] = str_getcsv($line);
    }
    return $rows;
}
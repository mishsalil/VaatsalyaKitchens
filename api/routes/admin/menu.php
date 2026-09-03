<?php
/* Admin menu management — full CRUD over categories, subcategories, items, and
   per-item variants (base price + delta) + add-ons.

   GET  /api/admin/menu                       — categories + subcategories + items (incl. inactive), each item with its variants & add-ons.
   POST /api/admin/menu/add_category          {name} → {id}
   POST /api/admin/menu/rename_category/{id}  {name}
   POST /api/admin/menu/toggle_category/{id}  {active:0|1}
   POST /api/admin/menu/delete_category/{id}  (cascade-deletes its subcategories + items)
   POST /api/admin/menu/reorder_categories    {ids:[...]}
   POST /api/admin/menu/add_subcategory       {category_id,name} → {id}
   POST /api/admin/menu/rename_subcategory/{id} {name}
   POST /api/admin/menu/toggle_subcategory/{id} {active:0|1}
   POST /api/admin/menu/delete_subcategory/{id} (items' subcategory_id → NULL via FK)
   POST /api/admin/menu/reorder_subcategories {ids:[...]}
   POST /api/admin/menu/add_item              {category_id,subcategory_id?,name,price,unit,variants[],addons[]} → {id}
   POST /api/admin/menu/update_item/{id}      {name,price,unit,category_id,subcategory_id?,variants[],addons[]}  (full-replace variants & addons)
   POST /api/admin/menu/toggle_item/{id}      {available:0|1}
   POST /api/admin/menu/delete_item/{id}
   POST /api/admin/menu/reorder_items         {ids:[...]}

   Variants carry a signed price_delta added to the item base price; add-ons
   carry an absolute price. On update_item the variants/addons arrays FULLY
   REPLACE the existing rows. Prices are validated server-side and stored as
   DECIMAL; the storefront never trusts client prices. New items get the
   default branch_id so they appear on /order. */
function route($method, $action, $parts): void
{
    require_admin_cap('menu');
    $db = db();

    // --- list everything (admin sees inactive categories + unavailable items) ---
    if ($action === 'index' && $method === 'GET') {
        $cats = $db->query(
            'SELECT id, name, sort_order, active FROM menu_categories ORDER BY sort_order, id'
        )->fetchAll();
        foreach ($cats as &$c) {
            $c['active'] = (int)$c['active'] === 1;
        }
        unset($c);

        $subcats = $db->query(
            'SELECT id, category_id, name, sort_order, active FROM menu_subcategories
             ORDER BY category_id, sort_order, id'
        )->fetchAll();
        foreach ($subcats as &$s) {
            $s['active'] = (int)$s['active'] === 1;
        }
        unset($s);

        $items = $db->query(
            'SELECT id, category_id, subcategory_id, name, price, unit, available, sort_order
               FROM menu_items ORDER BY sort_order, id'
        )->fetchAll();
        $itemIds = array_map(fn($i) => (int)$i['id'], $items);
        $vByItem = [];
        $aByItem = [];
        if ($itemIds) {
            $ph = implode(',', array_fill(0, count($itemIds), '?'));
            $vs = $db->prepare("SELECT id, item_id, name, price_delta, is_default, sort_order FROM menu_item_variants WHERE item_id IN ($ph) ORDER BY sort_order, id");
            $vs->execute($itemIds);
            foreach ($vs->fetchAll() as $v) {
                $vByItem[(int)$v['item_id']][] = [
                    'id' => (int)$v['id'], 'name' => $v['name'],
                    'price_delta' => (float)$v['price_delta'],
                    'is_default' => (int)$v['is_default'] === 1,
                    'sort_order' => (int)$v['sort_order'],
                ];
            }
            $as = $db->prepare("SELECT id, item_id, name, price, available, sort_order FROM menu_item_addons WHERE item_id IN ($ph) ORDER BY sort_order, id");
            $as->execute($itemIds);
            foreach ($as->fetchAll() as $a) {
                $aByItem[(int)$a['item_id']][] = [
                    'id' => (int)$a['id'], 'name' => $a['name'],
                    'price' => (float)$a['price'],
                    'available' => (int)$a['available'] === 1,
                    'sort_order' => (int)$a['sort_order'],
                ];
            }
        }
        foreach ($items as &$it) {
            $iid = (int)$it['id'];
            $it['price'] = (float)$it['price'];
            $it['available'] = (int)$it['available'] === 1;
            $it['subcategory_id'] = $it['subcategory_id'] !== null ? (int)$it['subcategory_id'] : null;
            $it['variants'] = $vByItem[$iid] ?? [];
            $it['addons'] = $aByItem[$iid] ?? [];
        }
        unset($it);

        Response::json(['categories' => $cats, 'subcategories' => $subcats, 'items' => $items]);
    }

    // --- export the menu as CSV (category,subcategory,item,price,unit,available,variants,addons) ---
    if ($action === 'export' && $method === 'GET') {
        $rows = $db->query(
            'SELECT mi.id, mc.name AS category, ms.name AS subcategory, mi.name AS item,
                    mi.price, mi.unit, mi.available
               FROM menu_items mi
               JOIN menu_categories mc ON mc.id = mi.category_id
               LEFT JOIN menu_subcategories ms ON ms.id = mi.subcategory_id
              ORDER BY mc.sort_order, mc.id, mi.sort_order, mi.id'
        )->fetchAll();
        $ids = array_map(fn($r) => (int)$r['id'], $rows);
        $vByItem = [];
        $aByItem = [];
        if ($ids) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $vs = $db->prepare("SELECT item_id, name, price_delta, is_default FROM menu_item_variants WHERE item_id IN ($ph) ORDER BY sort_order, id");
            $vs->execute($ids);
            foreach ($vs->fetchAll() as $v) {
                $vByItem[(int)$v['item_id']][] = ['name' => $v['name'], 'price_delta' => $v['price_delta'], 'is_default' => (int)$v['is_default'] === 1];
            }
            $as = $db->prepare("SELECT item_id, name, price FROM menu_item_addons WHERE item_id IN ($ph) ORDER BY sort_order, id");
            $as->execute($ids);
            foreach ($as->fetchAll() as $a) {
                $aByItem[(int)$a['item_id']][] = ['name' => $a['name'], 'price' => $a['price']];
            }
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="vaatsalya-menu.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['category', 'subcategory', 'item', 'price', 'unit', 'available', 'variants', 'addons']);
        foreach ($rows as $r) {
            $iid = (int)$r['id'];
            fputcsv($out, [
                $r['category'], $r['subcategory'] ?? '', $r['item'], (float)$r['price'], $r['unit'],
                (int)$r['available'] ? 'yes' : 'no',
                format_variants_cell($vByItem[$iid] ?? []),
                format_addons_cell($aByItem[$iid] ?? []),
            ]);
        }
        fclose($out);
        exit;
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    // --- import the menu from CSV (header-mapped; upsert by category + item name) ---
    if ($action === 'import') {
        $parsed = read_csv_with_header('file');
        $columns = $parsed['columns'];
        $colIdx = [];
        foreach ($columns as $i => $name) {
            $lower = strtolower(trim($name));
            if (!isset($colIdx[$lower])) {
                $colIdx[$lower] = $i;
            }
        }
        $col = function (array $row, string $name) use ($colIdx): string {
            $i = $colIdx[strtolower($name)] ?? null;
            return $i !== null ? (string)($row[$i] ?? '') : '';
        };

        $created = 0;
        $updated = 0;
        $categoriesCreated = 0;
        $subcategoriesCreated = 0;
        $errors = [];
        $branchId = config()['default_branch_id'] ?? 1;

        $catByName = $db->prepare('SELECT id FROM menu_categories WHERE name = ?');
        $subByName = $db->prepare('SELECT id FROM menu_subcategories WHERE category_id = ? AND name = ?');
        $itemByName = $db->prepare('SELECT id FROM menu_items WHERE category_id = ? AND name = ?');
        $maxCatSort = $db->prepare('SELECT COALESCE(MAX(sort_order),0) FROM menu_categories');
        $maxSubSort = $db->prepare('SELECT COALESCE(MAX(sort_order),0) FROM menu_subcategories WHERE category_id = ?');
        $maxItemSort = $db->prepare('SELECT COALESCE(MAX(sort_order),0) FROM menu_items');
        $insCat = $db->prepare('INSERT INTO menu_categories (name, sort_order, active) VALUES (?, ?, 1)');
        $insSub = $db->prepare('INSERT INTO menu_subcategories (category_id, name, sort_order, active) VALUES (?, ?, ?, 1)');
        $insItem = $db->prepare(
            'INSERT INTO menu_items (category_id, subcategory_id, name, price, unit, available, sort_order, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $updItem = $db->prepare(
            'UPDATE menu_items SET subcategory_id = ?, price = ?, unit = ?, available = ? WHERE id = ?'
        );

        $catCache = [];      // name → id
        $subCache = [];      // "catId:subName" → id
        $rowNum = 1;
        foreach ($parsed['rows'] as $row) {
            $rowNum++;
            $catName = mb_substr(trim($col($row, 'category')), 0, 120);
            $subName = mb_substr(trim($col($row, 'subcategory')), 0, 120);
            $itemName = mb_substr(trim($col($row, 'item')), 0, 160);
            $price = parse_price($col($row, 'price'));
            $unit = mb_substr(trim($col($row, 'unit')), 0, 60);
            $avail = parse_yes_no($col($row, 'available'), true);
            $variantsCell = $col($row, 'variants');
            $addonsCell = $col($row, 'addons');
            if ($catName === '' || $itemName === '') {
                $errors[] = ['row' => $rowNum, 'msg' => 'Missing category or item name.'];
                continue;
            }
            if ($price === null) {
                $errors[] = ['row' => $rowNum, 'msg' => 'Invalid price.'];
                continue;
            }

            // Resolve category id (create on first sight).
            if (isset($catCache[$catName])) {
                $categoryId = $catCache[$catName];
            } else {
                $catByName->execute([$catName]);
                $catId = $catByName->fetchColumn();
                if (!$catId) {
                    $maxCatSort->execute();
                    $sort = (int)$maxCatSort->fetchColumn() + 1;
                    $insCat->execute([$catName, $sort]);
                    $catId = (int)$db->lastInsertId();
                    $categoriesCreated++;
                }
                $catCache[$catName] = $catId = (int)$catId;
                $categoryId = $catId;
            }

            // Resolve subcategory id (optional; create on first sight).
            $subcategoryId = null;
            if ($subName !== '') {
                $key = $categoryId . ':' . $subName;
                if (isset($subCache[$key])) {
                    $subcategoryId = $subCache[$key];
                } else {
                    $subByName->execute([$categoryId, $subName]);
                    $subId = $subByName->fetchColumn();
                    if (!$subId) {
                        $maxSubSort->execute([$categoryId]);
                        $sort = (int)$maxSubSort->fetchColumn() + 1;
                        $insSub->execute([$categoryId, $subName, $sort]);
                        $subId = (int)$db->lastInsertId();
                        $subcategoriesCreated++;
                    }
                    $subCache[$key] = $subId = (int)$subId;
                    $subcategoryId = $subId;
                }
            }

            // Upsert the item by (category, name).
            $itemByName->execute([$categoryId, $itemName]);
            $itemId = $itemByName->fetchColumn();
            if ($itemId) {
                $updItem->execute([$subcategoryId, $price, $unit, $avail ? 1 : 0, (int)$itemId]);
                $itemId = (int)$itemId;
                $updated++;
            } else {
                $maxItemSort->execute();
                $sort = (int)$maxItemSort->fetchColumn() + 1;
                $insItem->execute([$categoryId, $subcategoryId, $itemName, $price, $unit, $avail ? 1 : 0, $sort, $branchId]);
                $itemId = (int)$db->lastInsertId();
                $created++;
            }

            // Full-replace variants & add-ons from the parsed cells.
            save_item_options($db, $itemId, parse_variants_cell($variantsCell), parse_addons_cell($addonsCell));
        }
        Response::json([
            'ok' => true, 'created' => $created, 'updated' => $updated,
            'categories_created' => $categoriesCreated, 'subcategories_created' => $subcategoriesCreated,
            'errors' => $errors,
        ]);
    }

    // --- categories ---
    if ($action === 'add_category') {
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 120);
        if ($name === '') {
            Response::error('Please enter a category name.');
        }
        $maxSort = (int)$db->query('SELECT COALESCE(MAX(sort_order),0) FROM menu_categories')->fetchColumn();
        $stmt = $db->prepare('INSERT INTO menu_categories (name, sort_order, active) VALUES (?, ?, 1)');
        $stmt->execute([$name, $maxSort + 1]);
        Response::json(['id' => (int)$db->lastInsertId()]);
    }

    if ($action === 'rename_category') {
        $id = (int)($parts[3] ?? 0);
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 120);
        if ($name === '') {
            Response::error('Please enter a category name.');
        }
        if (!category_exists($id)) {
            Response::error('Category not found.', 404);
        }
        $db->prepare('UPDATE menu_categories SET name = ? WHERE id = ?')->execute([$name, $id]);
        Response::success('Renamed');
    }

    if ($action === 'toggle_category') {
        $id = (int)($parts[3] ?? 0);
        $active = !empty($_POST['active']) ? 1 : 0;
        if (!category_exists($id)) {
            Response::error('Category not found.', 404);
        }
        $db->prepare('UPDATE menu_categories SET active = ? WHERE id = ?')->execute([$active, $id]);
        Response::success('Updated');
    }

    if ($action === 'delete_category') {
        $id = (int)($parts[3] ?? 0);
        if (!category_exists($id)) {
            Response::error('Category not found.', 404);
        }
        // subcategories + items cascade-delete via FKs
        $db->prepare('DELETE FROM menu_categories WHERE id = ?')->execute([$id]);
        Response::success('Deleted');
    }

    if ($action === 'reorder_categories') {
        $ids = normalize_int_list($_POST['ids'] ?? []);
        if (!$ids) {
            Response::error('No order provided.');
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM menu_categories WHERE id IN ($ph)");
        $stmt->execute($ids);
        if ((int)$stmt->fetchColumn() !== count($ids)) {
            Response::error('One or more categories not found.', 404);
        }
        $upd = $db->prepare('UPDATE menu_categories SET sort_order = ? WHERE id = ?');
        $db->beginTransaction();
        try {
            foreach ($ids as $i => $cid) {
                $upd->execute([$i, $cid]);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Could not reorder categories.', 500);
        }
        Response::success('Reordered');
    }

    // --- subcategories ---
    if ($action === 'add_subcategory') {
        $categoryId = (int)($_POST['category_id'] ?? 0);
        if (!category_exists($categoryId)) {
            Response::error('Category not found.', 404);
        }
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 120);
        if ($name === '') {
            Response::error('Please enter a subcategory name.');
        }
        $stmt = $db->prepare('SELECT COALESCE(MAX(sort_order),0) FROM menu_subcategories WHERE category_id = ?');
        $stmt->execute([$categoryId]);
        $sort = (int)$stmt->fetchColumn() + 1;
        $ins = $db->prepare('INSERT INTO menu_subcategories (category_id, name, sort_order, active) VALUES (?, ?, ?, 1)');
        $ins->execute([$categoryId, $name, $sort]);
        Response::json(['id' => (int)$db->lastInsertId()]);
    }

    if ($action === 'rename_subcategory') {
        $id = (int)($parts[3] ?? 0);
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 120);
        if ($name === '') {
            Response::error('Please enter a subcategory name.');
        }
        if (!subcategory_exists($id)) {
            Response::error('Subcategory not found.', 404);
        }
        $db->prepare('UPDATE menu_subcategories SET name = ? WHERE id = ?')->execute([$name, $id]);
        Response::success('Renamed');
    }

    if ($action === 'toggle_subcategory') {
        $id = (int)($parts[3] ?? 0);
        $active = !empty($_POST['active']) ? 1 : 0;
        if (!subcategory_exists($id)) {
            Response::error('Subcategory not found.', 404);
        }
        $db->prepare('UPDATE menu_subcategories SET active = ? WHERE id = ?')->execute([$active, $id]);
        Response::success('Updated');
    }

    if ($action === 'delete_subcategory') {
        $id = (int)($parts[3] ?? 0);
        if (!subcategory_exists($id)) {
            Response::error('Subcategory not found.', 404);
        }
        // items' subcategory_id → NULL via FK ON DELETE SET NULL
        $db->prepare('DELETE FROM menu_subcategories WHERE id = ?')->execute([$id]);
        Response::success('Deleted');
    }

    if ($action === 'reorder_subcategories') {
        $ids = normalize_int_list($_POST['ids'] ?? []);
        if (!$ids) {
            Response::error('No order provided.');
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM menu_subcategories WHERE id IN ($ph)");
        $stmt->execute($ids);
        if ((int)$stmt->fetchColumn() !== count($ids)) {
            Response::error('One or more subcategories not found.', 404);
        }
        $upd = $db->prepare('UPDATE menu_subcategories SET sort_order = ? WHERE id = ?');
        $db->beginTransaction();
        try {
            foreach ($ids as $i => $sid) {
                $upd->execute([$i, $sid]);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Could not reorder subcategories.', 500);
        }
        Response::success('Reordered');
    }

    // --- items ---
    if ($action === 'add_item') {
        $categoryId = (int)($_POST['category_id'] ?? 0);
        if (!category_exists($categoryId)) {
            Response::error('Category not found.', 404);
        }
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 160);
        if ($name === '') {
            Response::error('Please enter an item name.');
        }
        $price = parse_price($_POST['price'] ?? '');
        if ($price === null) {
            Response::error('Please enter a valid price.');
        }
        $unit = mb_substr(trim((string)($_POST['unit'] ?? '')), 0, 60);
        $subcategoryId = normalize_subcategory_id($_POST['subcategory_id'] ?? null, $categoryId);
        $variants = $_POST['variants'] ?? [];
        $addons = $_POST['addons'] ?? [];
        $branchId = config()['default_branch_id'] ?? 1;
        $maxSort = (int)$db->query('SELECT COALESCE(MAX(sort_order),0) FROM menu_items')->fetchColumn();

        $db->beginTransaction();
        try {
            $db->prepare(
                'INSERT INTO menu_items (category_id, subcategory_id, name, price, unit, available, sort_order, branch_id)
                 VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
            )->execute([$categoryId, $subcategoryId, $name, $price, $unit, $maxSort + 1, $branchId]);
            $itemId = (int)$db->lastInsertId();
            save_item_options($db, $itemId, $variants, $addons);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            error_log('menu/add_item failed: ' . $e->getMessage());
            Response::error('Could not save the item.', 500);
        }
        Response::json(['id' => $itemId]);
    }

    if ($action === 'update_item') {
        $id = (int)($parts[3] ?? 0);
        $row = item_exists($id);
        if (!$row) {
            Response::error('Item not found.', 404);
        }
        $name = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 160);
        if ($name === '') {
            Response::error('Please enter an item name.');
        }
        $price = parse_price($_POST['price'] ?? '');
        if ($price === null) {
            Response::error('Please enter a valid price.');
        }
        $unit = mb_substr(trim((string)($_POST['unit'] ?? '')), 0, 60);
        $categoryId = (int)($_POST['category_id'] ?? $row['category_id']);
        if (!category_exists($categoryId)) {
            Response::error('Category not found.', 404);
        }
        $subcategoryId = normalize_subcategory_id($_POST['subcategory_id'] ?? null, $categoryId);
        $variants = $_POST['variants'] ?? [];
        $addons = $_POST['addons'] ?? [];

        $db->beginTransaction();
        try {
            $db->prepare('UPDATE menu_items SET name = ?, price = ?, unit = ?, category_id = ?, subcategory_id = ? WHERE id = ?')
                ->execute([$name, $price, $unit, $categoryId, $subcategoryId, $id]);
            save_item_options($db, $id, $variants, $addons);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            error_log('menu/update_item failed: ' . $e->getMessage());
            Response::error('Could not save the item.', 500);
        }
        Response::success('Updated');
    }

    if ($action === 'toggle_item') {
        $id = (int)($parts[3] ?? 0);
        $available = !empty($_POST['available']) ? 1 : 0;
        if (!item_exists($id)) {
            Response::error('Item not found.', 404);
        }
        $db->prepare('UPDATE menu_items SET available = ? WHERE id = ?')->execute([$available, $id]);
        Response::success('Updated');
    }

    if ($action === 'delete_item') {
        $id = (int)($parts[3] ?? 0);
        if (!item_exists($id)) {
            Response::error('Item not found.', 404);
        }
        $db->prepare('DELETE FROM menu_items WHERE id = ?')->execute([$id]);
        Response::success('Deleted');
    }

    if ($action === 'reorder_items') {
        $ids = normalize_int_list($_POST['ids'] ?? []);
        if (!$ids) {
            Response::error('No order provided.');
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM menu_items WHERE id IN ($ph)");
        $stmt->execute($ids);
        if ((int)$stmt->fetchColumn() !== count($ids)) {
            Response::error('One or more items not found.', 404);
        }
        $upd = $db->prepare('UPDATE menu_items SET sort_order = ? WHERE id = ?');
        $db->beginTransaction();
        try {
            foreach ($ids as $i => $iid) {
                $upd->execute([$i, $iid]);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Could not reorder items.', 500);
        }
        Response::success('Reordered');
    }

    Response::error('Method not allowed', 405);
}

function category_exists(int $id): bool
{
    $stmt = db()->prepare('SELECT 1 FROM menu_categories WHERE id = ?');
    $stmt->execute([$id]);
    return (bool)$stmt->fetchColumn();
}

function subcategory_exists(int $id): bool
{
    $stmt = db()->prepare('SELECT 1 FROM menu_subcategories WHERE id = ?');
    $stmt->execute([$id]);
    return (bool)$stmt->fetchColumn();
}

function item_exists(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, category_id FROM menu_items WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

/** Coerce a posted subcategory_id into a valid id belonging to $categoryId, or null. */
function normalize_subcategory_id($v, int $categoryId): ?int
{
    $id = (int)$v;
    if ($id <= 0) {
        return null;
    }
    $stmt = db()->prepare('SELECT 1 FROM menu_subcategories WHERE id = ? AND category_id = ?');
    $stmt->execute([$id, $categoryId]);
    return $stmt->fetchColumn() ? $id : null;
}

/**
 * Full-replace an item's variants and add-ons. Empty-name rows are dropped.
 * Variant is_default is normalized so at most one row is default (first marked).
 * sort_order follows the array index.
 */
function save_item_options($db, int $itemId, $variants, $addons): void
{
    $db->prepare('DELETE FROM menu_item_variants WHERE item_id = ?')->execute([$itemId]);
    $db->prepare('DELETE FROM menu_item_addons WHERE item_id = ?')->execute([$itemId]);

    $insV = $db->prepare(
        'INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    $seenDefault = false;
    foreach (($variants ?? []) as $i => $v) {
        $name = mb_substr(trim((string)($v['name'] ?? '')), 0, 80);
        if ($name === '') {
            continue;
        }
        $delta = parse_delta($v['price_delta'] ?? 0);
        if ($delta === null) {
            $delta = 0.0;
        }
        $isDefault = !$seenDefault && !empty($v['is_default']);
        if ($isDefault) {
            $seenDefault = true;
        }
        $insV->execute([$itemId, $name, $delta, $isDefault ? 1 : 0, (int)$i]);
    }

    $insA = $db->prepare(
        'INSERT INTO menu_item_addons (item_id, name, price, available, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    foreach (($addons ?? []) as $i => $a) {
        $name = mb_substr(trim((string)($a['name'] ?? '')), 0, 80);
        if ($name === '') {
            continue;
        }
        $price = parse_price($a['price'] ?? 0);
        if ($price === null) {
            $price = 0.0;
        }
        $avail = !empty($a['available']) ? 1 : 0;
        $insA->execute([$itemId, $name, $price, $avail, (int)$i]);
    }
}

/** Accepts "250", "250.00", "₹ 250", "2,500". Returns float>=0 or null. */
function parse_price($v): ?float
{
    if (is_int($v) || is_float($v)) {
        return $v >= 0 ? (float)$v : null;
    }
    $s = preg_replace('/[^0-9.]/', '', (string)$v);
    if ($s === '' || $s === '.') {
        return null;
    }
    $f = (float)$s;
    return $f >= 0 ? $f : null;
}

/** Like parse_price but allows a negative value (variant price_delta). */
function parse_delta($v): ?float
{
    if (is_int($v) || is_float($v)) {
        return (float)$v;
    }
    $s = preg_replace('/[^0-9.\-]/', '', (string)$v);
    if ($s === '' || $s === '-' || $s === '.' || $s === '-.') {
        return null;
    }
    return is_numeric($s) ? (float)$s : null;
}

/** Coerces a JSON array (or comma string) of ids into a clean int[]. */
function normalize_int_list($v): array
{
    if (!is_array($v)) {
        $v = array_filter(preg_split('/\s*,\s*/', (string)$v));
    }
    $out = [];
    foreach ($v as $x) {
        $i = (int)$x;
        if ($i > 0) {
            $out[] = $i;
        }
    }
    return array_values($out);
}

/** yes/no/1/0/true/false → bool. Empty → $default. */
function parse_yes_no($v, bool $default = true): bool
{
    $s = strtolower(trim((string)$v));
    if ($s === '') {
        return $default;
    }
    return in_array($s, ['yes', 'y', '1', 'true', 't', 'available'], true);
}

/** variants cell → [{name, price_delta(string), is_default}, ...]. Format: "Half:-70|Full:*+150". */
function parse_variants_cell(string $cell): array
{
    $out = [];
    foreach (explode('|', $cell) as $seg) {
        $seg = trim($seg);
        if ($seg === '') {
            continue;
        }
        $colon = strpos($seg, ':');
        if ($colon === false) {
            $name = $seg;
            $deltaStr = '0';
        } else {
            $name = trim(substr($seg, 0, $colon));
            $deltaStr = trim(substr($seg, $colon + 1));
        }
        if ($name === '') {
            continue;
        }
        $isDefault = false;
        if ($deltaStr !== '' && $deltaStr[0] === '*') {
            $isDefault = true;
            $deltaStr = substr($deltaStr, 1);
        }
        $out[] = ['name' => $name, 'price_delta' => $deltaStr, 'is_default' => $isDefault];
    }
    return $out;
}

/** addons cell → [{name, price(string), available:true}, ...]. Format: "Cheese:40|Cashews:60". */
function parse_addons_cell(string $cell): array
{
    $out = [];
    foreach (explode('|', $cell) as $seg) {
        $seg = trim($seg);
        if ($seg === '') {
            continue;
        }
        $colon = strpos($seg, ':');
        if ($colon === false) {
            $name = $seg;
            $priceStr = '0';
        } else {
            $name = trim(substr($seg, 0, $colon));
            $priceStr = trim(substr($seg, $colon + 1));
        }
        if ($name === '') {
            continue;
        }
        $out[] = ['name' => $name, 'price' => $priceStr, 'available' => true];
    }
    return $out;
}

/** Inverse of parse_variants_cell for CSV export. */
function format_variants_cell(array $variants): string
{
    $segs = [];
    foreach ($variants as $v) {
        $delta = (float)$v['price_delta'];
        $sign = $delta >= 0 ? '+' : '';
        $segs[] = $v['name'] . ':' . ($v['is_default'] ? '*' : '') . $sign . $delta;
    }
    return implode('|', $segs);
}

/** Inverse of parse_addons_cell for CSV export. */
function format_addons_cell(array $addons): string
{
    $segs = [];
    foreach ($addons as $a) {
        $segs[] = $a['name'] . ':' . (float)$a['price'];
    }
    return implode('|', $segs);
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

/** Like read_uploaded_csv but also returns the header row (for column-name mapping). */
function read_csv_with_header(string $field): array
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
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $lines = explode("\n", $text);
    $columns = [];
    $rows = [];
    $first = true;
    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }
        $cells = str_getcsv($line);
        if ($first) {
            $columns = $cells;
            $first = false;
            continue;
        }
        $rows[] = $cells;
    }
    return ['columns' => $columns, 'rows' => $rows];
}
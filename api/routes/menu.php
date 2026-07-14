<?php
/* GET /api/menu — active categories + their subcategories + available items
   (NULL branch_id = shared/default, so admin-created items still show) for the
   current branch. Each item carries its variants (all) and add-ons (available
   only) so the storefront can render a chooser modal. Prices are pre-tax. */
function route($method, $action, $parts): void
{
    if ($method !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    $db = db();
    $branchId = config()['default_branch_id'] ?? 1;

    $cats = $db->query(
        'SELECT id, name, sort_order FROM menu_categories
         WHERE active = 1 ORDER BY sort_order, id'
    )->fetchAll();

    $subcats = $db->query(
        'SELECT id, category_id, name, sort_order FROM menu_subcategories
         WHERE active = 1 ORDER BY sort_order, id'
    )->fetchAll();

    $stmt = $db->prepare(
        'SELECT id, category_id, subcategory_id, name, price, unit FROM menu_items
          WHERE available = 1 AND (branch_id = ? OR branch_id IS NULL)
          ORDER BY sort_order, id'
    );
    $stmt->execute([$branchId]);
    $items = $stmt->fetchAll();

    $itemIds = array_map(fn($i) => (int)$i['id'], $items);
    $variantsByItem = [];
    $addonsByItem = [];
    if ($itemIds) {
        $ph = implode(',', array_fill(0, count($itemIds), '?'));
        $vStmt = $db->prepare(
            "SELECT id, item_id, name, price_delta, is_default, sort_order
               FROM menu_item_variants WHERE item_id IN ($ph) ORDER BY sort_order, id"
        );
        $vStmt->execute($itemIds);
        foreach ($vStmt->fetchAll() as $v) {
            $iid = (int)$v['item_id'];
            $variantsByItem[$iid][] = [
                'id' => (int)$v['id'],
                'name' => $v['name'],
                'price_delta' => (float)$v['price_delta'],
                'is_default' => (int)$v['is_default'] === 1,
                'sort_order' => (int)$v['sort_order'],
            ];
        }
        $aStmt = $db->prepare(
            "SELECT id, item_id, name, price, sort_order
               FROM menu_item_addons WHERE item_id IN ($ph) AND available = 1
             ORDER BY sort_order, id"
        );
        $aStmt->execute($itemIds);
        foreach ($aStmt->fetchAll() as $a) {
            $iid = (int)$a['item_id'];
            $addonsByItem[$iid][] = [
                'id' => (int)$a['id'],
                'name' => $a['name'],
                'price' => (float)$a['price'],
                'sort_order' => (int)$a['sort_order'],
            ];
        }
    }

    foreach ($items as &$it) {
        $iid = (int)$it['id'];
        $it['price'] = (float)$it['price'];
        $it['subcategory_id'] = $it['subcategory_id'] !== null ? (int)$it['subcategory_id'] : null;
        $it['variants'] = $variantsByItem[$iid] ?? [];
        $it['addons'] = $addonsByItem[$iid] ?? [];
    }
    unset($it);

    Response::json([
        'categories' => $cats,
        'subcategories' => $subcats,
        'items' => $items,
    ]);
}
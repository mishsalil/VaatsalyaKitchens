<?php
/* Writing an order's line items.
   Shared by customer checkout, counter entry, and the counter edit screen —
   all three build the same $lines shape (prices always re-read from the DB,
   never trusted from the client) and must snapshot it identically.

   Each line carries both the frozen text (item_name / variant_name /
   addons_text, what the bill says) and the menu ids behind it (migration_007,
   so an edit can rebuild the line exactly rather than matching on name). */

/**
 * Validate a line's variant choice against the item's groups and snapshot it.
 * Groups are the distinct group_label values on the item, in order of their
 * first row (sort_order, id). Exactly one chosen id per group; ids that do not
 * belong to the item are ignored. A legacy `variant_id` (older app builds) is
 * read as a one-element list when `variant_ids` is absent.
 *
 * @return array{delta: float, name: ?string, ids: ?string}
 */
function resolve_item_variants(PDO $pdo, int $itemId, string $itemName, array $posted): array
{
    $stmt = $pdo->prepare(
        'SELECT id, group_label, name, price_delta FROM menu_item_variants WHERE item_id = ? ORDER BY sort_order, id'
    );
    $stmt->execute([$itemId]);
    $rows = $stmt->fetchAll();
    if (!$rows) {
        return ['delta' => 0.0, 'name' => null, 'ids' => null];
    }

    $posted_ids = isset($posted['variant_ids']) && is_array($posted['variant_ids'])
        ? array_map('intval', $posted['variant_ids'])
        : ((int)($posted['variant_id'] ?? 0) > 0 ? [(int)$posted['variant_id']] : []);

    $groups = [];               // label => list of rows, in first-seen order
    foreach ($rows as $r) {
        $groups[$r['group_label']][] = $r;
    }

    $delta = 0.0; $names = []; $ids = [];
    foreach ($groups as $label => $options) {
        $chosen = [];
        foreach ($options as $o) {
            if (in_array((int)$o['id'], $posted_ids, true)) $chosen[] = $o;
        }
        if (count($chosen) > 1) {
            Response::error("Please choose one $label for $itemName.");
        }
        if (!$chosen) {
            Response::error("Please choose $label for $itemName.");
        }
        $delta  += (float)$chosen[0]['price_delta'];
        $names[] = $chosen[0]['name'];
        $ids[]   = (int)$chosen[0]['id'];
    }
    return ['delta' => $delta, 'name' => implode(', ', $names), 'ids' => implode(',', $ids)];
}

/**
 * Replace an order's lines. $lines entries need:
 *   name, unit, price, qty, variant_name, addons_text,
 *   menu_item_id, variant_ids, addon_ids
 */
function insert_order_lines(PDO $pdo, int $orderId, array $lines, bool $replace = false): void
{
    if ($replace) {
        $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$orderId]);
    }
    $stmt = $pdo->prepare(
        'INSERT INTO order_items
            (order_id, menu_item_id, variant_id, variant_ids, addon_ids,
             item_name, variant_name, addons_text, unit, price, qty)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $line) {
        $stmt->execute([
            $orderId,
            $line['menu_item_id'] ?? null,
            $line['variant_ids'] ?? null,
            $line['addon_ids'] ?? null,
            $line['name'],
            $line['variant_name'],
            $line['addons_text'],
            $line['unit'],
            $line['price'],
            $line['qty'],
        ]);
    }
}

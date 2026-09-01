<?php
/* Writing an order's line items.
   Shared by customer checkout, counter entry, and the counter edit screen —
   all three build the same $lines shape (prices always re-read from the DB,
   never trusted from the client) and must snapshot it identically.

   Each line carries both the frozen text (item_name / variant_name /
   addons_text, what the bill says) and the menu ids behind it (migration_007,
   so an edit can rebuild the line exactly rather than matching on name). */

/**
 * Replace an order's lines. $lines entries need:
 *   name, unit, price, qty, variant_name, addons_text,
 *   menu_item_id, variant_id, addon_ids
 */
function insert_order_lines(PDO $pdo, int $orderId, array $lines, bool $replace = false): void
{
    if ($replace) {
        $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$orderId]);
    }
    $stmt = $pdo->prepare(
        'INSERT INTO order_items
            (order_id, menu_item_id, variant_id, addon_ids,
             item_name, variant_name, addons_text, unit, price, qty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $line) {
        $stmt->execute([
            $orderId,
            $line['menu_item_id'] ?? null,
            $line['variant_id'] ?? null,
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

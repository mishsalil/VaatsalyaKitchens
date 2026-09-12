<?php
/**
 * Export the local menu as a SQL file that replaces another database's menu,
 * keeping every id exactly as it is here.
 *
 * WHY IDS MATTER. Dish photos are files named after the menu item id
 * (see includes/dish_photos.php: "101.webp", "101-2.webp"). An export that let
 * the destination assign fresh ids would silently orphan all 94 photos, so this
 * writes the ids explicitly and resets AUTO_INCREMENT past the highest one.
 *
 * Run:  php scripts/export-menu-sql.php > database/menu_snapshot.sql
 */

require __DIR__ . '/../includes/db.php';

$pdo = db();

/* Child tables first, so the deletes below never trip a foreign key. Order
   matters here and is the reverse of the insert order. */
const TABLES = [
    'menu_categories'    => ['id', 'name', 'sort_order', 'active'],
    'menu_subcategories' => null,   // columns read at runtime; may be unused
    'menu_items'         => ['id', 'category_id', 'subcategory_id', 'name', 'description', 'price', 'unit', 'available', 'sort_order', 'branch_id'],
    'menu_item_variants' => ['id', 'item_id', 'group_label', 'name', 'price_delta', 'is_default', 'sort_order'],
    'menu_item_addons'   => ['id', 'item_id', 'name', 'price', 'available', 'sort_order'],
];

function columns(PDO $pdo, string $table): array
{
    return $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
}

function literal(PDO $pdo, $value): string
{
    if ($value === null) {
        return 'NULL';
    }
    if (is_int($value) || is_float($value)) {
        return (string)$value;
    }
    // Numeric strings out of PDO (prices, flags) are written bare so the file
    // reads like the schema rather than quoting every integer.
    if (is_string($value) && preg_match('/^-?\d+(\.\d+)?$/', $value)) {
        return $value;
    }
    return $pdo->quote((string)$value);
}

$out = [];
$counts = [];

foreach (array_keys(TABLES) as $table) {
    $cols = columns($pdo, $table);
    $rows = $pdo->query('SELECT ' . implode(', ', array_map(fn($c) => "`$c`", $cols)) . " FROM `$table` ORDER BY id")
                ->fetchAll(PDO::FETCH_ASSOC);
    $counts[$table] = count($rows);

    if (!$rows) {
        $out[$table] = "-- $table: no rows here, so the destination's are cleared and none added.\n";
        continue;
    }

    $lines = [];
    foreach ($rows as $r) {
        $vals = array_map(fn($c) => literal($pdo, $r[$c]), $cols);
        $lines[] = '  (' . implode(', ', $vals) . ')';
    }
    $maxId = max(array_map(fn($r) => (int)$r['id'], $rows));
    $out[$table] =
        "INSERT INTO `$table` (" . implode(', ', array_map(fn($c) => "`$c`", $cols)) . ") VALUES\n"
        . implode(",\n", $lines) . ";\n"
        . "ALTER TABLE `$table` AUTO_INCREMENT = " . ($maxId + 1) . ";\n";
}

$when = date('Y-m-d H:i');
$summary = implode("\n", array_map(
    fn($t, $n) => sprintf('--   %-20s %d rows', $t, $n),
    array_keys($counts),
    $counts
));

echo <<<SQL
-- =====================================================================
-- Menu snapshot — replaces the destination's menu with this one, ids intact.
--
-- Generated $when by scripts/export-menu-sql.php. Do not hand-edit; change
-- the menu in the admin and export again.
--
-- WHAT IT REPLACES
$summary
--
-- IDS ARE PRESERVED ON PURPOSE. Dish photos are files named after the menu
-- item id, so ids that shifted would orphan every photo. AUTO_INCREMENT is
-- reset past the highest id, so items added afterwards cannot collide.
--
-- WHAT IT DESTROYS. Every menu row in the destination, including the starter
-- menu that install_fresh.sql seeds, and any per-category opening hours.
-- Orders are NOT touched: each order line stores its own name, price and
-- quantity, so past bills and receipts read exactly as before. The one thing
-- that changes is editing an OLD order in the admin — a line whose menu item
-- no longer exists can no longer be rebuilt from the menu, only from the
-- snapshot it already carries.
--
-- Run it once, on the destination database:
--   mysql -u USER -p DBNAME < database/menu_snapshot.sql
-- or paste it into phpMyAdmin with the database selected.
--
-- It runs as one transaction: if any statement fails, nothing changes.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

START TRANSACTION;

-- Out with the old, children first so no foreign key is left dangling.
DELETE FROM `category_hours`;
DELETE FROM `menu_item_addons`;
DELETE FROM `menu_item_variants`;
DELETE FROM `menu_items`;
DELETE FROM `menu_subcategories`;
DELETE FROM `menu_categories`;


SQL;

foreach (array_keys(TABLES) as $table) {
    echo $out[$table] . "\n";
}

echo <<<SQL
COMMIT;

-- Read these back. Each count must match the header above.
SELECT 'menu_categories'    AS table_name, COUNT(*) AS rows_now FROM menu_categories
UNION ALL SELECT 'menu_subcategories', COUNT(*) FROM menu_subcategories
UNION ALL SELECT 'menu_items',         COUNT(*) FROM menu_items
UNION ALL SELECT 'menu_item_variants', COUNT(*) FROM menu_item_variants
UNION ALL SELECT 'menu_item_addons',   COUNT(*) FROM menu_item_addons;

-- The id range the dish photos are named after. If these do not match the
-- filenames in /menu, the photos will not appear.
SELECT MIN(id) AS lowest_item_id, MAX(id) AS highest_item_id FROM menu_items;

SQL;

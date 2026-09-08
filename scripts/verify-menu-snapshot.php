<?php
/* Proves database/menu_snapshot.sql does what it claims: on a database built
   the way production was (install_fresh.sql), it replaces the starter menu
   with this one, ids intact, and leaves existing orders readable.

   It also checks the thing that actually matters for the site looking right —
   that every dish photo in web/public/menu is named after an item id that
   exists after the import. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

function run(PDO $pdo, array $files): void {
    foreach ($files as $f) {
        foreach (stmts($f) as $s) {
            if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) {
                $st = $pdo->query($s); $st->fetchAll(); $st->closeCursor();
            } else {
                $pdo->exec($s);
            }
        }
    }
}

$db = 'vk_menu_snapshot_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");

echo "built a database the way production was built (install_fresh.sql)\n";
run($pdo, ['database/install_fresh.sql']);

$before = [
    'categories' => (int)$pdo->query('SELECT COUNT(*) FROM menu_categories')->fetchColumn(),
    'items'      => (int)$pdo->query('SELECT COUNT(*) FROM menu_items')->fetchColumn(),
];
printf("  starter menu: %d categories, %d items\n", $before['categories'], $before['items']);

/* An order against the starter menu, so we can prove the import does not
   disturb order history — the thing most likely to go wrong here. */
$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Snapshot Test', '9999900001')");
$custId = (int)$pdo->lastInsertId();
$seedItem = $pdo->query('SELECT id, name, price FROM menu_items ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Snapshot Test', '9999900001', 'tomorrow', 'new', 100, 100, 1)");
$orderId = (int)$pdo->lastInsertId();
$ins = $pdo->prepare('INSERT INTO order_items (order_id, menu_item_id, item_name, unit, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
$ins->execute([$orderId, $seedItem['id'], $seedItem['name'], 'plate', $seedItem['price'], 2]);
printf("  placed order #%d for '%s' against the starter menu\n", $orderId, $seedItem['name']);

echo "\napplying database/menu_snapshot.sql\n";
run($pdo, ['database/menu_snapshot.sql']);

$after = [
    'categories'  => (int)$pdo->query('SELECT COUNT(*) FROM menu_categories')->fetchColumn(),
    'items'       => (int)$pdo->query('SELECT COUNT(*) FROM menu_items')->fetchColumn(),
    'variants'    => (int)$pdo->query('SELECT COUNT(*) FROM menu_item_variants')->fetchColumn(),
    'addons'      => (int)$pdo->query('SELECT COUNT(*) FROM menu_item_addons')->fetchColumn(),
];
printf("  now: %d categories, %d items, %d variants, %d add-ons\n",
    $after['categories'], $after['items'], $after['variants'], $after['addons']);

$fail = 0;

/* 1. It matches the source database exactly. */
$srcDb = config()['db']['name'];
$srcCounts = [];
foreach (['menu_categories' => 'categories', 'menu_items' => 'items',
          'menu_item_variants' => 'variants', 'menu_item_addons' => 'addons'] as $t => $k) {
    $srcCounts[$k] = (int)$pdo->query("SELECT COUNT(*) FROM `$srcDb`.`$t`")->fetchColumn();
}
echo "\n";
foreach ($after as $k => $n) {
    $ok = $n === $srcCounts[$k];
    printf("  %-11s %-4d vs %-4d in the live menu   %s\n", $k, $n, $srcCounts[$k], $ok ? 'OK' : 'MISMATCH');
    if (!$ok) { $fail++; }
}

/* 2. Ids survived — this is what keeps the photos attached. */
$pdo->exec("USE `$db`");
$range = $pdo->query('SELECT MIN(id) lo, MAX(id) hi FROM menu_items')->fetch(PDO::FETCH_ASSOC);
printf("\n  item id range after import: %d-%d\n", $range['lo'], $range['hi']);

/* 3. Every photo on disk points at an item that exists. */
$ids = array_map('intval', $pdo->query('SELECT id FROM menu_items')->fetchAll(PDO::FETCH_COLUMN));
$idSet = array_flip($ids);
$orphans = [];
$matched = 0;
foreach (glob('web/public/menu/*.webp') as $file) {
    $base = basename($file, '.webp');
    $itemId = (int)preg_replace('/-\d+$/', '', $base);
    if (isset($idSet[$itemId])) { $matched++; } else { $orphans[] = basename($file); }
}
printf("  dish photos matching an item: %d\n", $matched);
printf("  orphaned photos             : %d %s\n", count($orphans),
    $orphans ? '-> ' . implode(', ', array_slice($orphans, 0, 5)) : '');
if ($orphans) { $fail++; }

/* 4. The old order still reads correctly. */
$line = $pdo->query("SELECT item_name, price, qty FROM order_items WHERE order_id = $orderId")->fetch(PDO::FETCH_ASSOC);
$orders = (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn();
printf("\n  orders kept: %d; its line still reads '%s' x%d at %s\n",
    $orders, $line['item_name'], $line['qty'], $line['price']);
if ($orders !== 1 || $line['item_name'] !== $seedItem['name']) { $fail++; }

/* 5. A new item gets an id past the imported ones. */
$cat = (int)$pdo->query('SELECT id FROM menu_categories ORDER BY id LIMIT 1')->fetchColumn();
$pdo->exec("INSERT INTO menu_items (category_id, name, price, unit, available, sort_order, branch_id)
            VALUES ($cat, 'Collision Check', 10, 'plate', 1, 999, 1)");
$newId = (int)$pdo->lastInsertId();
printf("  a newly added item got id %d (must be > %d)  %s\n",
    $newId, $range['hi'], $newId > $range['hi'] ? 'OK' : 'COLLISION');
if ($newId <= (int)$range['hi']) { $fail++; }

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\nscratch database dropped\n";
echo $fail === 0 ? "\nALL CHECKS PASSED\n" : "\n$fail CHECK(S) FAILED\n";
exit($fail === 0 ? 0 : 1);

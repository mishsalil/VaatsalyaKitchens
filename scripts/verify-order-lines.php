<?php
/* Variant groups at order time: exactly one choice per group, ids must belong
   to the item, legacy variant_id still accepted. Throwaway DB, dropped at end.
   Response::error() is stubbed to throw so a refusal is an assertable value. */

chdir(__DIR__ . '/..');
require 'includes/db.php';

class VerifyRefused extends RuntimeException {}
if (!class_exists('Response')) {
    class Response {
        public static function error(string $msg, int $code = 422): void { throw new VerifyRefused($msg); }
        public static function json($d, int $c = 200): void {}
    }
}
require 'includes/order_lines.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}
function refused(callable $fn): ?string {
    try { $fn(); return null; } catch (VerifyRefused $e) { return $e->getMessage(); }
}

$pdo = db();
$dbName = 'vk_verify_lines_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE menu_item_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, item_id INT UNSIGNED NOT NULL,
  group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation', name VARCHAR(80) NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0, is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0, PRIMARY KEY (id))");
// item 1: Preparation (Normal +0 default, Ghee +20) and Vegetables (With +0 default, Without +0)
$pdo->exec("INSERT INTO menu_item_variants (id,item_id,group_label,name,price_delta,is_default,sort_order) VALUES
  (11,1,'Preparation','Normal',0,1,0),(12,1,'Preparation','Ghee',20,0,1),
  (13,1,'Vegetables','With Vegetables',0,1,2),(14,1,'Vegetables','Without Vegetables',0,0,3),
  (21,2,'Preparation','Half',-50,1,0),(22,2,'Preparation','Full',0,0,1)");

try {
    echo "an item with no variants\n";
    $r = resolve_item_variants($pdo, 9, 'Plain Rice', []);
    check('no delta',  0.0,  $r['delta']);
    check('no name',   null, $r['name']);
    check('no ids',    null, $r['ids']);

    echo "\nboth groups chosen\n";
    $r = resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [14, 12]]);
    check('delta is the sum',           20.0,                       $r['delta']);
    check('names in group order',       'Ghee, Without Vegetables', $r['name']);
    check('ids in group order',         '12,14',                    $r['ids']);

    echo "\none group missing\n";
    check('names the missing group', 'Please choose Vegetables for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [12]])));
    check('nothing chosen names the first group', 'Please choose Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', [])));

    echo "\ntwo choices from one group\n";
    check('refused', 'Please choose one Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [11, 12, 13]])));

    echo "\na variant from another item\n";
    check('ignored, so the group reads as missing', 'Please choose Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [21, 13]])));

    echo "\nlegacy variant_id\n";
    $r = resolve_item_variants($pdo, 2, 'Dal', ['variant_id' => 21]);
    check('delta', -50.0, $r['delta']);
    check('name',  'Half', $r['name']);
    check('ids',   '21',   $r['ids']);
    $r = resolve_item_variants($pdo, 2, 'Dal', ['variant_id' => 22, 'variant_ids' => [21]]);
    check('variant_ids wins over variant_id', '21', $r['ids']);
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

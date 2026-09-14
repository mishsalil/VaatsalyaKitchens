<?php
/* The discount engine end to end on a throwaway database: the plan derived
   from one budget number, regeneration that deactivates rather than deletes,
   and every refusal message a customer can see. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/discounts.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}
function refused(callable $fn): ?string {
    try { $fn(); return null; } catch (DiscountError $e) { return $e->getMessage(); }
}
$row = fn(array $plan, string $kind) => array_values(array_filter($plan, fn($r) => $r['kind'] === $kind))[0] ?? null;

echo "discount_plan\n";
check('budget 0 → no codes', [], discount_plan(0, 400));
$p = discount_plan(10, 400);
check('three codes', ['WELCOME', 'VK10', 'FEAST'], array_column($p, 'code'));
check('WELCOME 15 % cap 100 first-order', [15.0, 100.0, 0.0, true],
    [$row($p, 'first')['pct'], $row($p, 'first')['max_amount'], $row($p, 'first')['min_order'], $row($p, 'first')['first_order_only']]);
check('VK10 10 % min 400 cap 150', [10.0, 150.0, 400.0, false],
    [$row($p, 'flat')['pct'], $row($p, 'flat')['max_amount'], $row($p, 'flat')['min_order'], $row($p, 'flat')['first_order_only']]);
check('FEAST 15 % min 800 cap 300', [15.0, 300.0, 800.0], [$row($p, 'big')['pct'], $row($p, 'big')['max_amount'], $row($p, 'big')['min_order']]);
$p = discount_plan(20, 430);
check('WELCOME capped at 24', 24.0, $row($p, 'first')['pct']);
check('FEAST capped at 24', 24.0, $row($p, 'big')['pct']);
check('min orders snap to ₹50', [450.0, 850.0], [$row($p, 'flat')['min_order'], $row($p, 'big')['min_order']]);
check('code text from rounded budget', 'VK13', $row(discount_plan(12.6, 400), 'flat')['code']);
check('a budget above 24 is itself capped', 24.0, $row(discount_plan(30, 400), 'flat')['pct']);

echo "\ndiscount_combined_ok\n";
check('23.99 ok', true,  discount_combined_ok(10, 13.99));
check('24 ok',    true,  discount_combined_ok(12, 12));
check('24.01 no', false, discount_combined_ok(12, 12.01));

$pdo = db();
$dbName = 'vk_verify_discounts_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE discount_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(20) NOT NULL, kind ENUM('first','flat','big') NOT NULL,
  pct DECIMAL(5,2) NOT NULL, max_amount DECIMAL(10,2) NOT NULL, min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_discount_code (code))");
$pdo->exec("CREATE TABLE orders (id INT UNSIGNED NOT NULL AUTO_INCREMENT, phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id))");

try {
    echo "\ndiscount_average_order\n";
    check('fewer than 10 delivered → 400', 400.0, discount_average_order($pdo));
    for ($i = 0; $i < 10; $i++) {
        $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000001', 'delivered', 500)");
    }
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, created_at) VALUES ('919000000001', 'delivered', 5000, NOW() - INTERVAL 40 DAY)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000001', 'cancelled', 5000)");
    check('30-day delivered average, cancelled and old ignored', 500.0, discount_average_order($pdo));

    echo "\ndiscount_regenerate\n";
    $active = discount_regenerate($pdo, 10);
    check('three active', ['WELCOME', 'VK10', 'FEAST'], array_column($active, 'code'));
    $vk10Id = (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'VK10'")->fetchColumn();
    $active = discount_regenerate($pdo, 12);
    check('VK10 deactivated, VK12 added', ['WELCOME', 'VK12', 'FEAST'], array_column($active, 'code'));
    check('VK10 row kept, inactive', '0', (string)$pdo->query("SELECT active FROM discount_codes WHERE code = 'VK10'")->fetchColumn());
    check('WELCOME keeps its id across regenerations', 1, (int)$pdo->query("SELECT COUNT(*) FROM discount_codes WHERE code = 'WELCOME'")->fetchColumn());
    $active = discount_regenerate($pdo, 10);
    check('VK10 reactivated in place', $vk10Id, (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'VK10' AND active = 1")->fetchColumn());
    check('budget 0 deactivates everything', [], discount_regenerate($pdo, 0));
    discount_regenerate($pdo, 10);

    echo "\ndiscount_check\n";
    check('unknown', "That code isn't valid.", refused(fn() => discount_check($pdo, 'NOPE', 1000, '919000000002')));
    check('inactive', "That code isn't valid.", refused(fn() => discount_check($pdo, 'VK12', 1000, '919000000002')));
    check('case-insensitive, trimmed', 'VK10', discount_check($pdo, ' vk10 ', 1000, null)['code']);
    check('below floor', 'Add ₹150 more to use VK10.', refused(fn() => discount_check($pdo, 'VK10', 350, null)));
    check('flat: 10 % of 1000', 100.0, discount_check($pdo, 'VK10', 1000, null)['amount']);
    check('flat: capped at 150', 150.0, discount_check($pdo, 'VK10', 2000, null)['amount']);
    check('effective pct after cap', 7.5, discount_check($pdo, 'VK10', 2000, null)['pct']);
    check('first-order without phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo, 'WELCOME', 500, null)));
    check('first-order: phone with delivered orders', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo, 'WELCOME', 500, '919000000001')));
    check('first-order: new phone ok', 75.0, discount_check($pdo, 'WELCOME', 500, '919000000002')['amount']);
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000003', 'cancelled', 300)");
    check('first-order: only a cancelled order before → still first', 75.0, discount_check($pdo, 'WELCOME', 500, '919000000003')['amount']);
    check('big: below its floor', 'Add ₹500 more to use FEAST.', refused(fn() => discount_check($pdo, 'FEAST', 500, null)));
    check('big: 15 % of 1000 = 150', 150.0, discount_check($pdo, 'FEAST', 1000, null)['amount']);
    check('first-order: phone with spaces, no country code, still normalizes', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo, 'WELCOME', 500, '90000 00001')));
    check('first-order: unparseable phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo, 'WELCOME', 500, 'abc')));
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

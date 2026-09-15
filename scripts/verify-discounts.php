<?php
/* The discount engine end to end on a throwaway database: the five-persona
   plan sized by one budget number, regeneration that matches by kind and
   deactivates rather than deletes, every refusal message a customer can see,
   the month statistics and the auto-pause. */

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

echo "discount_plan\n";
check('budget 0 → no codes', [], discount_plan(0, 400));
$p = discount_plan(24, 400);            // C = round(0.24*400/10)*10 = 100
check('five codes', ['WELCOME','COMEBACK','VK10','VK20','FEAST'], array_column($p, 'code'));
check('kinds', ['first','comeback','everyday','flat','big'], array_column($p, 'kind'));
check('pcts', [50.0,30.0,10.0,20.0,30.0], array_column($p, 'pct'));
check('caps from C=100', [150.0,150.0,100.0,150.0,300.0], array_column($p, 'max_amount'));
check('floors', [0.0,0.0,0.0,400.0,800.0], array_column($p, 'min_order'));
check('WELCOME first-order', true, $p[0]['first_order_only']);
check('COMEBACK lapsed 45', 45, $p[1]['lapsed_days']);
check('A=1000 B=24 → C=240', [360.0,360.0,240.0,360.0,720.0], array_column(discount_plan(24, 1000), 'max_amount'));
check('budget clamps at 50', 200.0, discount_plan(80, 400)[2]['max_amount']);

echo "\ndiscount_combined_ok\n";
check('combined: code alone ok', true, discount_combined_ok(50, 0));
check('combined: 50 + 1 no', false, discount_combined_ok(50, 1));
check('combined: 12 + 12 ok', true, discount_combined_ok(12, 12));
check('combined: 12 + 12.01 no', false, discount_combined_ok(12, 12.01));

$pdo = db();
$dbName = 'vk_verify_discounts_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE discount_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(20) NOT NULL, kind ENUM('first','comeback','everyday','flat','big') NOT NULL,
  pct DECIMAL(5,2) NOT NULL, max_amount DECIMAL(10,2) NOT NULL, min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0, lapsed_days SMALLINT UNSIGNED NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_discount_code (code))");
$pdo->exec("CREATE TABLE orders (id INT UNSIGNED NOT NULL AUTO_INCREMENT, phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0, discount_code VARCHAR(20) NULL,
  code_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id))");
$pdo->exec("CREATE TABLE settings (`key` VARCHAR(190) NOT NULL, `value` TEXT NULL, PRIMARY KEY (`key`))");
// all_settings() caches on first read, and discount_active() reads the pause
// flag — so both settings go in before anything below touches the engine.
// They only bite once the month's given/sales climbs above 10 %, which is
// exactly what the pause section arranges.
set_setting('discount_auto_pause', '1');
set_setting('discount_budget_pct', '10');

try {
    echo "\ndiscount_average_order\n";
    check('fewer than 10 delivered → 400', 400.0, discount_average_order($pdo));
    for ($i = 0; $i < 10; $i++) {
        $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000099', 'delivered', 500)");
    }
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, created_at) VALUES ('919000000099', 'delivered', 5000, NOW() - INTERVAL 40 DAY)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000099', 'cancelled', 5000)");
    check('30-day delivered average, cancelled and old ignored', 500.0, discount_average_order($pdo));
    $pdo->exec('DELETE FROM orders');   // back to A = ₹400 for everything below

    echo "\ndiscount_regenerate\n";
    $active = discount_regenerate($pdo, 24);
    check('five active', ['WELCOME','COMEBACK','VK10','VK20','FEAST'], array_column($active, 'code'));
    check('kinds in order', ['first','comeback','everyday','flat','big'], array_column($active, 'kind'));
    check('lapsed_days stored', [0, 45, 0, 0, 0], array_column($active, 'lapsed_days'));
    check('nothing paused', [false, false, false, false, false], array_column($active, 'paused'));
    $comebackId = (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'COMEBACK'")->fetchColumn();
    $pdo->exec("UPDATE discount_codes SET code = 'BACK4U' WHERE code = 'COMEBACK'");
    $active = discount_regenerate($pdo, 24);
    check('renamed comeback code keeps its name', ['WELCOME','BACK4U','VK10','VK20','FEAST'], array_column($active, 'code'));
    check('renamed comeback code keeps its id', $comebackId, (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'BACK4U'")->fetchColumn());
    check('no COMEBACK row re-inserted', 0, (int)$pdo->query("SELECT COUNT(*) FROM discount_codes WHERE code = 'COMEBACK'")->fetchColumn());
    check('still five rows in all', 5, (int)$pdo->query('SELECT COUNT(*) FROM discount_codes')->fetchColumn());
    check('budget 0 deactivates everything', [], discount_regenerate($pdo, 0));
    check('inactive', "That code isn't valid.", refused(fn() => discount_check($pdo, 'VK10', 1000, null)));
    $pdo->exec("UPDATE discount_codes SET code = 'COMEBACK' WHERE code = 'BACK4U'");
    check('A=1000 caps after a regenerate', [360.0, 360.0, 240.0, 360.0, 720.0],
        array_column(discount_plan(24, 1000), 'max_amount'));
    $active = discount_regenerate($pdo, 24);
    check('five active again, ids kept', 5, (int)$pdo->query('SELECT COUNT(*) FROM discount_codes')->fetchColumn());

    echo "\ndiscount_check\n";
    // 919000000001 ordered 50 days ago, 919000000002 ten days ago, 919000000003 never.
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, created_at) VALUES ('919000000001', 'delivered', 600, NOW() - INTERVAL 50 DAY)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, created_at) VALUES ('919000000002', 'delivered', 600, NOW() - INTERVAL 10 DAY)");
    check('unknown', "That code isn't valid.", refused(fn() => discount_check($pdo, 'NOPE', 1000, '919000000003')));
    check('case-insensitive, trimmed', 'VK10', discount_check($pdo, ' vk10 ', 1000, null)['code']);
    check('WELCOME fresh phone: 50 % of 200 = 100', 100.0, discount_check($pdo,'WELCOME',200,'919000000003')['amount']);
    check('WELCOME capped at 150', 150.0, discount_check($pdo,'WELCOME',1000,'919000000003')['amount']);
    check('WELCOME needs phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo,'WELCOME',500,null)));
    check('WELCOME prior order', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo,'WELCOME',500,'919000000001')));
    check('COMEBACK lapsed 50 days ok', 150.0, discount_check($pdo,'COMEBACK',1000,'919000000001')['amount']);
    check('COMEBACK 10 days ago', "COMEBACK is for customers we haven't seen in a while.", refused(fn() => discount_check($pdo,'COMEBACK',500,'919000000002')));
    check('COMEBACK never ordered', 'COMEBACK is for returning customers — try WELCOME on your first order.', refused(fn() => discount_check($pdo,'COMEBACK',500,'919000000003')));
    check('COMEBACK needs phone', 'Enter your phone number to use COMEBACK.', refused(fn() => discount_check($pdo,'COMEBACK',500,null)));
    check('VK10 anyone, no floor', 10.0, discount_check($pdo,'VK10',100,null)['amount']);
    check('VK20 floor', 'Add ₹150 more to use VK20.', refused(fn() => discount_check($pdo,'VK20',250,null)));
    check('FEAST 30 % of 1000 = 300 (cap 300)', 300.0, discount_check($pdo,'FEAST',1000,null)['amount']);
    check('FEAST below its floor', 'Add ₹300 more to use FEAST.', refused(fn() => discount_check($pdo, 'FEAST', 500, null)));
    check('effective pct after cap', 15.0, discount_check($pdo, 'WELCOME', 1000, '919000000003')['pct']);
    check('cap binds: amount recomputed from the 2-dp pct (±₹0.40)', [5.33, 100.01],
        [discount_check($pdo, 'VK10', 1876.33, null)['pct'], discount_check($pdo, 'VK10', 1876.33, null)['amount']]);
    check('phone with spaces, no country code, still normalizes', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo, 'WELCOME', 500, '90000 00001')));
    check('unparseable phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo, 'WELCOME', 500, 'abc')));
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000004', 'cancelled', 300)");
    check('only a cancelled order before → still first', 100.0, discount_check($pdo, 'WELCOME', 200, '919000000004')['amount']);
    check('a cancelled order does not make a returning customer', 'COMEBACK is for returning customers — try WELCOME on your first order.',
        refused(fn() => discount_check($pdo, 'COMEBACK', 500, '919000000004')));

    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000005', 'new', 500)");
    $editOrderId = (int)$pdo->lastInsertId();
    check('own new order (status new) counts against a first-order code', 'WELCOME is for your first order only.',
        refused(fn() => discount_check($pdo, 'WELCOME', 500, '919000000005')));
    check('excluding the order being edited, still first', 150.0,
        discount_check($pdo, 'WELCOME', 500, '919000000005', $editOrderId)['amount']);
    check('excluding the order being edited, comeback sees no prior order', 'COMEBACK is for returning customers — try WELCOME on your first order.',
        refused(fn() => discount_check($pdo, 'COMEBACK', 500, '919000000005', $editOrderId)));

    echo "\ndiscount_check: an edited order keeps its own code\n";
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code) VALUES ('919000000006', 'new', 1000, 'VK10')");
    $ownVk10Id = (int)$pdo->lastInsertId();
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code) VALUES ('919000000006', 'new', 1000, 'WELCOME')");
    $ownWelcomeId = (int)$pdo->lastInsertId();
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code) VALUES ('919000000006', 'new', 1000, 'COMEBACK')");
    $ownComebackId = (int)$pdo->lastInsertId();
    discount_regenerate($pdo, 0);   // everything switched off
    check('own code, now inactive, still honoured', 100.0, discount_check($pdo, 'VK10', 1000, '919000000006', $ownVk10Id)['amount']);
    check('same inactive code on a different order refused', "That code isn't valid.",
        refused(fn() => discount_check($pdo, 'VK10', 1000, '919000000006', $ownWelcomeId)));
    discount_regenerate($pdo, 24);
    check('own first-order code skips the first-order check', 150.0,
        discount_check($pdo, 'WELCOME', 1000, '919000000006', $ownWelcomeId)['amount']);
    check('a different first-order code on that phone is still refused', 'WELCOME is for your first order only.',
        refused(fn() => discount_check($pdo, 'WELCOME', 1000, '919000000006', $ownVk10Id)));
    check('own comeback code skips the lapsed check', 150.0,
        discount_check($pdo, 'COMEBACK', 1000, '919000000006', $ownComebackId)['amount']);
    check('own code still needs its floor', 'Add ₹150 more to use VK20.', refused(fn() => discount_check($pdo, 'VK20', 250, null, $ownVk10Id)));

    echo "\ndiscount_month_stats and the pause\n";
    $pdo->exec('DELETE FROM orders');
    check('empty month', ['sales' => 0.0, 'given' => 0.0, 'pct' => 0.0], discount_month_stats($pdo));
    check('not paused with nothing given', false, discount_paused($pdo, 10));
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code, code_amount) VALUES ('919000000007', 'delivered', 1000, 'VK10', 300)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000008', 'new', 1000)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code, code_amount) VALUES ('919000000008', 'cancelled', 500, 'VK10', 500)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code, code_amount, created_at) VALUES ('919000000008', 'delivered', 900, 'VK10', 900, NOW() - INTERVAL 40 DAY)");
    check('this month, cancelled and last month ignored', ['sales' => 2000.0, 'given' => 300.0, 'pct' => 15.0], discount_month_stats($pdo));
    check('paused: 15 % given against a 10 % budget', true, discount_paused($pdo, 10));
    check('not paused: 15 % given against a 24 % budget', false, discount_paused($pdo, 24));
    check('budget 0 never pauses', false, discount_paused($pdo, 0));
    check('setting budget 10 → paused', true, discount_paused($pdo));
    $active = discount_active($pdo);
    check('all but WELCOME paused', [false, true, true, true, true], array_column($active, 'paused'));
    check('VK10 paused', 'VK10 is taking a break this month.', refused(fn() => discount_check($pdo, 'VK10', 1000, null)));
    check('FEAST paused', 'FEAST is taking a break this month.', refused(fn() => discount_check($pdo, 'FEAST', 1000, null)));
    check('WELCOME still works', 100.0, discount_check($pdo, 'WELCOME', 200, '919000000009')['amount']);
    check('the real reason comes before the pause', 'Add ₹150 more to use VK20.', refused(fn() => discount_check($pdo, 'VK20', 250, null)));
    check('the pause is not the reason for a missing phone', 'Enter your phone number to use COMEBACK.', refused(fn() => discount_check($pdo, 'COMEBACK', 500, null)));
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, discount_code) VALUES ('919000000010', 'new', 1000, 'VK10')");
    $ownId = (int)$pdo->lastInsertId();
    check('an edited order keeps its code through the pause', 100.0, discount_check($pdo, 'VK10', 1000, null, $ownId)['amount']);
    $pdo->exec("UPDATE settings SET value = '0' WHERE `key` = 'discount_auto_pause'");
    // the settings cache still says '1' in this process — a fresh process sees the toggle off
    $off = trim((string)shell_exec(sprintf('"%s" -r %s', PHP_BINARY, escapeshellarg(
        "chdir('" . addslashes(getcwd()) . "'); require 'includes/discounts.php'; \$p = db(); \$p->exec('USE `$dbName`'); var_export(discount_paused(\$p, 10));"
    ))));
    check('auto-pause off → never paused', 'false', $off);
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

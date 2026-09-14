<?php
/* The discount engine and the bill agree: what discount_check() promises for a
   code is exactly what compute_order_total() takes off once the order stores
   that code's 2-dp percentage. Throwaway database, no HTTP. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/discounts.php';
require 'includes/gst.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}

$pdo = db();
$dbName = 'vk_verify_order_discount_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE discount_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(20) NOT NULL, kind ENUM('first','flat','big') NOT NULL,
  pct DECIMAL(5,2) NOT NULL, max_amount DECIMAL(10,2) NOT NULL, min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_discount_code (code))");
$pdo->exec("CREATE TABLE orders (id INT UNSIGNED NOT NULL AUTO_INCREMENT, phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0, discount_code VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id))");

try {
    // Budget 10, no delivered orders → average ₹400: WELCOME 15 % cap 100,
    // VK10 10 % min 400 cap 150, FEAST 15 % min 800 cap 300.
    $codes = discount_regenerate($pdo, 10);
    check('seeded', ['WELCOME', 'VK10', 'FEAST'], array_column($codes, 'code'));

    echo "\ncode amount == bill discount_amount\n";
    $freshPhone = '919000000009';
    foreach ([200, 667, 999.99, 1234.56, 2000, 7968.15] as $subtotal) {
        foreach ($codes as $c) {
            if ($subtotal < $c['min_order']) {
                continue;
            }
            $r = discount_check($pdo, $c['code'], $subtotal, $freshPhone);
            $bill = compute_order_total($subtotal, 5, $r['pct']);
            check(sprintf('%s on ₹%s → %s %% = ₹%s', $c['code'], $subtotal, $r['pct'], $r['amount']),
                $r['amount'], $bill['discount_amount']);
            check(sprintf('%s on ₹%s within ₹0.40 of the cap', $c['code'], $subtotal), true,
                $r['amount'] <= $c['max_amount'] + 0.40);
        }
    }

    echo "\ndiscount_combined_ok\n";
    check('12 + 12 ok', true,  discount_combined_ok(12, 12));
    check('12 + 13 no', false, discount_combined_ok(12, 13));

    echo "\nlegacy orders unaffected\n";
    $legacy = compute_gst(1000, 5);
    $bill   = compute_order_total(1000, 5, 0);
    check('total/cgst/sgst match compute_gst', [$legacy['total'], $legacy['cgst'], $legacy['sgst']],
        [$bill['total'], $bill['cgst'], $bill['sgst']]);
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

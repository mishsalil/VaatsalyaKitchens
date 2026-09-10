<?php
/* Review tokens: issue, resolve, burn. Same selector/validator shape as claim
   tokens (includes/auth.php), with one deliberate difference — resolving does
   NOT burn, because a customer who opens the link and comes back later must
   still be able to rate. Burning happens on submit.

   Runs against a throwaway database. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_tokens_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

require 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}

$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Token Test', '9999900002')");
$custId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Token Test', '9999900002', 'today', 'delivered', 100, 100, 1)");
$orderId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Token Test', '9999900002', 'today', 'delivered', 100, 100, 1)");
$otherOrder = (int)$pdo->lastInsertId();

echo "issue and resolve\n";
$t1 = review_token_issue($orderId);
check('token has selector.validator shape', 1, substr_count($t1, '.'));
check('resolves to the order', $orderId, review_token_resolve($t1));
check('resolving twice still works (not burned)', $orderId, review_token_resolve($t1));

echo "\nmany tokens per order, all valid\n";
$t2 = review_token_issue($orderId);
check('second token differs', true, $t1 !== $t2);
check('first token still resolves', $orderId, review_token_resolve($t1));
check('second token resolves', $orderId, review_token_resolve($t2));

echo "\nrejections\n";
check('null', null, review_token_resolve(null));
check('empty', null, review_token_resolve(''));
check('no dot', null, review_token_resolve('garbage'));
check('unknown selector', null, review_token_resolve('aaaaaaaaaaaaaaaaaaaaaaaa.bbbb'));
[$sel, $val] = explode('.', $t1, 2);
check('tampered validator', null, review_token_resolve($sel . '.' . strrev($val)));
check('right selector, other order validator', null,
    review_token_resolve($sel . '.' . explode('.', review_token_issue($otherOrder), 2)[1]));

echo "\nexpiry\n";
$expired = review_token_issue($orderId);
[$eSel] = explode('.', $expired, 2);
$pdo->prepare('UPDATE review_tokens SET expires_at = ? WHERE selector = ?')
    ->execute([(new DateTime('-1 hour'))->format('Y-m-d H:i:s'), $eSel]);
check('expired token rejected', null, review_token_resolve($expired));
check('unexpired sibling still fine', $orderId, review_token_resolve($t1));

echo "\nburn takes them all\n";
review_tokens_burn($orderId);
check('first burned', null, review_token_resolve($t1));
check('second burned', null, review_token_resolve($t2));
check('other order untouched', 1,
    (int)$pdo->query("SELECT COUNT(*) FROM review_tokens WHERE order_id = $otherOrder")->fetchColumn());

echo "\nvalidator is never stored in plaintext\n";
$t3 = review_token_issue($orderId);
[$s3, $v3] = explode('.', $t3, 2);
$st = $pdo->prepare('SELECT validator_hash FROM review_tokens WHERE selector = ?');
$st->execute([$s3]);
$stored = (string)$st->fetchColumn();
check('stored value is not the validator', true, $stored !== $v3);
check('stored value is its sha256', hash('sha256', $v3), $stored);

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

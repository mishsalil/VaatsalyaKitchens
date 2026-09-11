<?php
/* Everything the submit path must refuse. Runs review_submit() directly against
   a throwaway database — the HTTP layer above it only unpacks JSON, and the
   rules that matter are here. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_validation_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

require 'includes/reviews.php';
require_once 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; } else { $fail++; echo "  FAIL $what\n"; }
}
/** Returns the exception message, or '' when the call succeeded. */
function refuses(callable $fn): string {
    try { $fn(); return ''; } catch (Throwable $e) { return $e->getMessage(); }
}

$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Val Test', '9999900003')");
$custId = (int)$pdo->lastInsertId();
function makeOrder(PDO $pdo, int $custId): array {
    $pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
                VALUES ($custId, 'Val Test', '9999900003', 'today', 'delivered', 100, 100, 1)");
    $orderId = (int)$pdo->lastInsertId();
    $ins = $pdo->prepare('INSERT INTO order_items (order_id, menu_item_id, item_name, unit, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    $ins->execute([$orderId, 7, 'Paneer', 'plate', 200, 1]);
    $lineA = (int)$pdo->lastInsertId();
    $ins->execute([$orderId, 9, 'Dal', 'plate', 100, 1]);
    $lineB = (int)$pdo->lastInsertId();
    return [$orderId, $lineA, $lineB];
}

[$orderA, $a1, $a2] = makeOrder($pdo, $custId);
[$orderB, $b1, ]    = makeOrder($pdo, $custId);

echo "stars must be an integer 1..5\n";
foreach ([0, 6, -1, 99] as $bad) {
    check("refuses stars = $bad", refuses(fn() => review_submit($orderA, $bad, null, [], 'link')) !== '');
}
check('accepts stars = 1', refuses(fn() => review_submit($orderA, 1, null, [], 'link')) === '');

echo "\none review per order\n";
check('refuses a second review', refuses(fn() => review_submit($orderA, 5, null, [], 'link')) !== '');
check('still exactly one row', (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderA")->fetchColumn() === 1);

echo "\ncomment length\n";
[$orderC, $c1, ] = makeOrder($pdo, $custId);
check('accepts 1000 characters', refuses(fn() => review_submit($orderC, 4, str_repeat('x', 1000), [], 'link')) === '');
[$orderD, , ] = makeOrder($pdo, $custId);
check('refuses 1001 characters', refuses(fn() => review_submit($orderD, 4, str_repeat('x', 1001), [], 'link')) !== '');

echo "\nper-dish rows must belong to the order\n";
[$orderE, $e1, $e2] = makeOrder($pdo, $custId);
check('refuses a line from another order',
    refuses(fn() => review_submit($orderE, 4, null, [['order_item_id' => $b1, 'stars' => 5]], 'link')) !== '');
check('nothing was written on refusal',
    (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderE")->fetchColumn() === 0);
check('accepts this order\'s own lines',
    refuses(fn() => review_submit($orderE, 4, null,
        [['order_item_id' => $e1, 'stars' => 5], ['order_item_id' => $e2, 'stars' => 2]], 'link')) === '');
check('wrote both dish rows', (int)$pdo->query(
    "SELECT COUNT(*) FROM order_item_reviews r JOIN order_reviews o ON o.id = r.review_id WHERE o.order_id = $orderE"
)->fetchColumn() === 2);
check('denormalised menu_item_id', (int)$pdo->query(
    "SELECT menu_item_id FROM order_item_reviews r JOIN order_reviews o ON o.id = r.review_id
      WHERE o.order_id = $orderE AND r.order_item_id = $e1"
)->fetchColumn() === 7);

echo "\nper-dish stars are validated too\n";
[$orderF, $f1, ] = makeOrder($pdo, $custId);
check('refuses a dish rated 0',
    refuses(fn() => review_submit($orderF, 4, null, [['order_item_id' => $f1, 'stars' => 0]], 'link')) !== '');
check('nothing written', (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderF")->fetchColumn() === 0);

echo "\ncancelled orders cannot be rated\n";
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Val Test', '9999900003', 'today', 'cancelled', 100, 100, 1)");
$cancelled = (int)$pdo->lastInsertId();
check('refuses a cancelled order', refuses(fn() => review_submit($cancelled, 5, null, [], 'link')) !== '');

echo "\nsubmitting burns the order's tokens\n";
[$orderG, , ] = makeOrder($pdo, $custId);
$tok = review_token_issue($orderG);
check('token valid before', review_token_resolve($tok) === $orderG);
review_submit($orderG, 5, null, [], 'link');
check('token dead after', review_token_resolve($tok) === null);

echo "\ncomment is stored verbatim, never escaped at rest\n";
[$orderH, , ] = makeOrder($pdo, $custId);
$raw = "<script>alert(1)</script> बहुत अच्छा";
review_submit($orderH, 5, $raw, [], 'link');
check('stored byte-for-byte', $pdo->query(
    "SELECT comment FROM order_reviews WHERE order_id = $orderH")->fetchColumn() === $raw);

echo "\na completed rating hands a claim link ONLY to a customer with no PIN\n";
/* $custId has no pin_hash — it was inserted with none. */
[$orderI, , ] = makeOrder($pdo, $custId);
review_submit($orderI, 5, null, [], 'link');
$claim = review_claim_token_after($orderI);
check('pin-less customer gets a claim token', is_string($claim) && str_contains($claim, '.'));
check('the claim token resolves to that customer', consume_claim_token($claim) === $custId);
check('and is single use', consume_claim_token($claim) === null);

$pdo->exec("INSERT INTO customers (name, phone, pin_hash) VALUES ('Has Pin', '9999900004', '" . password_hash('1234', PASSWORD_DEFAULT) . "')");
$pinnedId = (int)$pdo->lastInsertId();
[$orderJ, , ] = makeOrder($pdo, $pinnedId);
review_submit($orderJ, 5, null, [], 'link');
check('customer WITH a PIN gets nothing', review_claim_token_after($orderJ) === null);

echo "\nPIN reset: last four of the phone, and every session revoked\n";
$pdo->exec("INSERT INTO auth_tokens (subject_type, subject_id, selector, validator_hash, expires_at)
            VALUES ('customer', $pinnedId, 'aaaaaaaaaaaaaaaaaaaaaaaa', REPEAT('b', 64), DATE_ADD(NOW(), INTERVAL 1 DAY))");
$newPin = reset_customer_pin($pinnedId);
check('new PIN is the last four digits of 9999900004', $newPin === '0004');
$hash = $pdo->query("SELECT pin_hash FROM customers WHERE id = $pinnedId")->fetchColumn();
check('the stored hash verifies against that PIN', password_verify('0004', $hash));
check('the old PIN no longer works', !password_verify('1234', $hash));
check('every session for that customer is revoked',
    (int)$pdo->query("SELECT COUNT(*) FROM auth_tokens WHERE subject_type = 'customer' AND subject_id = $pinnedId")->fetchColumn() === 0);

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

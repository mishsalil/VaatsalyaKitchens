<?php
/* Proves the fail-closed guard in review_prompt_candidates() is real, not vacuous.

   This cannot live in verify-review-sweep.php. all_settings() in
   includes/settings.php holds a process-lifetime `static $cache` that nothing
   invalidates, so deleting the reviews_since row partway through an already-running
   script is invisible to setting() — a check added there would be testing the
   cache, not the guard. This script gets its own fresh PHP process, so the
   missing-cutover state is in place before the cache is ever populated. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_cutover_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Cutover Test', '9999900005')");
$custId = (int)$pdo->lastInsertId();

$long = (new DateTime('-1 day'))->format('Y-m-d H:i:s');
$st = $pdo->prepare(
    'INSERT INTO orders (customer_id, name, phone, needed_on, needed_at, status, delivered_at,
                         total_estimate, subtotal, branch_id, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 100, 100, 1, ?)'
);
$st->execute([$custId, 'Cutover Test', '9999900005', 'today', 'delivered', $long, $long]);
$orderId = (int)$pdo->lastInsertId();

/* Delete the cutover row BEFORE anything calls setting(), so the process-lifetime
   cache in all_settings() is populated in the deleted state. */
$pdo->exec("DELETE FROM settings WHERE `key` = 'reviews_since'");

require 'includes/reviews.php';
require_once 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; } else { $fail++; echo "  FAIL $what\n"; }
}

/* Check A: the fixture order really would qualify, independent of settings.
   review_due_at() is a pure function that never touches settings, so the
   cache cannot affect it. If this fails, the fixture isn't due and Check B
   below would be meaningless. */
$order = $pdo->query("SELECT * FROM orders WHERE id = $orderId")->fetch();
$dueAt = review_due_at($order);
$dueAtOk = $dueAt !== null && new DateTimeImmutable($dueAt) <= new DateTimeImmutable();
check('fixture order is genuinely due (proves Check B is non-vacuous)', $dueAtOk);

if (!$dueAtOk) {
    $pdo->exec("DROP DATABASE IF EXISTS `$db`");
    echo "\nfixture order is not actually due - stopping, Check B would be meaningless\n";
    echo "\n$pass passed, $fail failed\n";
    exit(1);
}

/* Check B: with reviews_since missing, the guard must return nothing. */
check('guard returns no candidates when reviews_since is missing', review_prompt_candidates() === []);

/* Check C: the customer-facing side (account.php's pending-review card) must
   fail closed the same way. It rests on the same fixture proved due in
   Check A, so this fails if review_next_due_order_for_customer() ever stops
   consulting review_cutover_since() rather than passing vacuously. */
check(
    'review_next_due_order_for_customer() returns nothing when reviews_since is missing',
    review_next_due_order_for_customer($custId) === null
);

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

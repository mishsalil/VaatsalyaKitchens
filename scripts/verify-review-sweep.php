<?php
/* Which orders the sweep picks up, and which it must leave alone.
   The dangerous failure here is a false positive — messaging a customer about
   a meal from months ago, or twice about the same one. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_sweep_test';
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
function ids(array $rows): array { return array_map(fn($r) => (int)$r['id'], $rows); }

$pdo->exec("UPDATE settings SET `value` = '2026-09-01 00:00:00' WHERE `key` = 'reviews_since'");
$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Sweep Test', '9999900004')");
$custId = (int)$pdo->lastInsertId();

/** Insert an order with explicit timing. */
function mk(PDO $pdo, int $custId, string $status, ?string $deliveredAt, ?string $neededAt, string $createdAt): int {
    $st = $pdo->prepare(
        'INSERT INTO orders (customer_id, name, phone, needed_on, needed_at, status, delivered_at,
                             total_estimate, subtotal, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 100, 100, 1, ?)'
    );
    $st->execute([$custId, 'Sweep Test', '9999900004', 'today', $neededAt, $status, $deliveredAt, $createdAt]);
    return (int)$pdo->lastInsertId();
}

$long = (new DateTime('-1 day'))->format('Y-m-d H:i:s');
$recent = (new DateTime('-5 minutes'))->format('Y-m-d H:i:s');

echo "picked up\n";
$due       = mk($pdo, $custId, 'delivered', $long, null, $long);
$fallback  = mk($pdo, $custId, 'preparing', null, $long, $long);
$counter   = mk($pdo, $custId, 'delivered', null, null, $long);
$got = ids(review_prompt_candidates());
check('delivered and past due', in_array($due, $got, true));
check('never marked delivered, past the fallback', in_array($fallback, $got, true));
check('counter order with no needed_at', in_array($counter, $got, true));

echo "\nleft alone\n";
$tooSoon   = mk($pdo, $custId, 'delivered', $recent, null, $recent);
$isNew     = mk($pdo, $custId, 'new', null, null, $long);
$cancelled = mk($pdo, $custId, 'cancelled', $long, null, $long);
$historic  = mk($pdo, $custId, 'delivered', '2026-08-01 12:00:00', null, '2026-08-01 12:00:00');
$got = ids(review_prompt_candidates());
check('not yet due', !in_array($tooSoon, $got, true));
check('status new', !in_array($isNew, $got, true));
check('cancelled', !in_array($cancelled, $got, true));
check('created before reviews_since', !in_array($historic, $got, true));

echo "\nalready rated\n";
$rated = mk($pdo, $custId, 'delivered', $long, null, $long);
$pdo->exec("INSERT INTO order_reviews (order_id, customer_id, stars) VALUES ($rated, $custId, 5)");
check('rated order dropped', !in_array($rated, ids(review_prompt_candidates()), true));

echo "\nprompt state\n";
review_prompt_record($due, review_due_at(['status' => 'delivered', 'delivered_at' => $long,
    'needed_at' => null, 'created_at' => $long]), true, null);
check('sent order dropped', !in_array($due, ids(review_prompt_candidates()), true));
check('sent_at recorded',
    $pdo->query("SELECT sent_at FROM review_prompts WHERE order_id = $due")->fetchColumn() !== null);

$dueAt = review_due_at(['status' => 'preparing', 'delivered_at' => null, 'needed_at' => $long, 'created_at' => $long]);
review_prompt_record($fallback, $dueAt, false, 'no subscription');
check('failed once, still a candidate', in_array($fallback, ids(review_prompt_candidates()), true));
review_prompt_record($fallback, $dueAt, false, 'no subscription');
review_prompt_record($fallback, $dueAt, false, 'no subscription');
check('after three failures it goes quiet', !in_array($fallback, ids(review_prompt_candidates()), true));
check('the error is kept for diagnosis',
    $pdo->query("SELECT last_error FROM review_prompts WHERE order_id = $fallback")->fetchColumn() === 'no subscription');

echo "\ndue_at is refreshed, not frozen\n";
$late = mk($pdo, $custId, 'confirmed', null, $long, $long);
review_prompt_record($late, review_due_at(['status' => 'confirmed', 'delivered_at' => null,
    'needed_at' => $long, 'created_at' => $long]), false, 'nope');
$deliveredNow = (new DateTime('-40 minutes'))->format('Y-m-d H:i:s');
$pdo->exec("UPDATE orders SET status = 'delivered', delivered_at = '$deliveredNow' WHERE id = $late");
$rows = array_values(array_filter(review_prompt_candidates(), fn($r) => (int)$r['id'] === $late));
check('still a candidate after delivery was marked', $rows !== []);
check('recomputed due_at uses delivered_at + 30',
    $rows !== [] && review_due_at($rows[0]) === (new DateTime($deliveredNow))->modify('+30 minutes')->format('Y-m-d H:i:s'));

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

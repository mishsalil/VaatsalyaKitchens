<?php
/* The 30/60-minute rule, exhaustively. These are pure functions over an order
   row, so this needs no database at all.

   The case worth staring at is the third block: counter orders never get
   needed_at (api/routes/admin/orders.php does not insert it), so created_at is
   not a fallback for missing data — it IS the counter path. */

chdir(__DIR__ . '/..');
require 'includes/reviews.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}

function order(array $over = []): array {
    return array_merge([
        'status'       => 'delivered',
        'delivered_at' => null,
        'needed_at'    => null,
        'created_at'   => '2026-09-10 12:00:00',
    ], $over);
}

echo "eligibility by status\n";
check('delivered is eligible',        true,  review_eligible_status('delivered'));
check('confirmed is eligible',        true,  review_eligible_status('confirmed'));
check('preparing is eligible',        true,  review_eligible_status('preparing'));
check('out_for_delivery is eligible', true,  review_eligible_status('out_for_delivery'));
check('new is NOT eligible',          false, review_eligible_status('new'));
check('cancelled is NOT eligible',    false, review_eligible_status('cancelled'));
check('unknown is NOT eligible',      false, review_eligible_status('banana'));

echo "\ndelivered_at drives the 30-minute rule\n";
check('delivered_at + 30', '2026-09-10 14:30:00',
    review_due_at(order(['delivered_at' => '2026-09-10 14:00:00'])));
check('delivered_at wins over needed_at', '2026-09-10 14:30:00',
    review_due_at(order(['delivered_at' => '2026-09-10 14:00:00', 'needed_at' => '2026-09-10 09:00:00'])));

echo "\nno delivered_at falls back 60 minutes\n";
check('needed_at + 60', '2026-09-10 14:00:00',
    review_due_at(order(['needed_at' => '2026-09-10 13:00:00'])));
check('counter order: created_at + 60', '2026-09-10 13:00:00',
    review_due_at(order()));
check('fallback applies to a non-delivered status', '2026-09-10 13:00:00',
    review_due_at(order(['status' => 'preparing'])));

echo "\nineligible orders have no due time at all\n";
check('new order', null, review_due_at(order(['status' => 'new'])));
check('cancelled order', null, review_due_at(order(['status' => 'cancelled'])));
check('cancelled even when delivered_at is set', null,
    review_due_at(order(['status' => 'cancelled', 'delivered_at' => '2026-09-10 14:00:00'])));

echo "\nmidnight and month boundaries\n";
check('crosses midnight', '2026-09-11 00:15:00',
    review_due_at(order(['delivered_at' => '2026-09-10 23:45:00'])));
check('crosses month end', '2026-10-01 00:20:00',
    review_due_at(order(['delivered_at' => '2026-09-30 23:50:00'])));
check('crosses year end on the fallback', '2027-01-01 00:30:00',
    review_due_at(order(['needed_at' => '2026-12-31 23:30:00'])));

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);

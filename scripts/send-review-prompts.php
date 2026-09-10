<?php
/* Sends review prompts that have come due. Run from cron every 5 minutes:
 *
 *   /usr/bin/php /home/<user>/domains/vaatsalyakitchens.in/scripts/send-review-prompts.php
 *
 * This is the ONLY scheduled job in the project. It exists because the agreed
 * rule — 60 minutes after the scheduled time when delivery was never marked —
 * cannot be served from a status-change handler: the whole point of that case
 * is that no status change happened.
 *
 * Safe to run concurrently: a MySQL advisory lock means a second copy exits
 * immediately rather than double-prompting.
 */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/helpers.php';
require 'includes/reviews.php';
require_once 'includes/review_tokens.php';
require 'includes/push.php';

$verbose = in_array('--verbose', $argv, true);
function say(string $line): void {
    global $verbose;
    if ($verbose) { echo $line, "\n"; }
}

$db = db();

/* 0 = do not wait. Two overlapping runs is a real possibility on a 5-minute
   schedule with a slow push round-trip, not a theoretical one. */
if ((int)$db->query("SELECT GET_LOCK('vk_review_prompts', 0)")->fetchColumn() !== 1) {
    say('another run holds the lock; exiting');
    exit(0);
}

try {
    $candidates = review_prompt_candidates(50);
    say(count($candidates) . ' order(s) due');

    $sent = 0; $failed = 0;
    foreach ($candidates as $order) {
        $orderId = (int)$order['id'];
        $dueAt   = review_due_at($order);
        if ($dueAt === null) {
            continue;   // status changed under us between query and loop
        }

        try {
            $token = review_token_issue($orderId);
            $result = push_send_to_customer(
                (int)$order['customer_id'],
                'How was your meal?',
                'Tap to rate your order — it takes a few seconds.',
                '/rate/' . $token
            );
            $ok = ($result[0] ?? 0) > 0;
            review_prompt_record($orderId, $dueAt, $ok, $ok ? null : 'no delivery target');
            $ok ? $sent++ : $failed++;
            say(sprintf('  order #%d: %s', $orderId, $ok ? 'sent' : 'no delivery target'));
        } catch (Throwable $e) {
            /* One bad order must never stop the batch. */
            review_prompt_record($orderId, $dueAt, false, $e->getMessage());
            $failed++;
            say(sprintf('  order #%d: %s', $orderId, $e->getMessage()));
        }
    }

    say("sent=$sent failed=$failed");
} finally {
    $db->query("SELECT RELEASE_LOCK('vk_review_prompts')");
}

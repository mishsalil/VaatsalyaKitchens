<?php
/* Round-trip tests for includes/tokens.php. Uses sentinel subject ids well
   outside the real ranges, and cleans up after itself. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/tokens.php';

$FAKE_CUSTOMER = 999901;
$FAKE_ADMIN    = 999902;

$pass = 0; $fail = 0;
function check(string $what, $got, $want) {
    global $pass, $fail;
    $ok = $got === $want;
    $ok ? $pass++ : $fail++;
    printf("  [%s] %s\n", $ok ? 'PASS' : 'FAIL', $what);
    if (!$ok) {
        echo "        got:  " . var_export($got, true) . "\n";
        echo "        want: " . var_export($want, true) . "\n";
    }
}

// Clean slate for the sentinels.
db()->prepare('DELETE FROM auth_tokens WHERE subject_id IN (?, ?)')->execute([$FAKE_CUSTOMER, $FAKE_ADMIN]);

echo "issue + resolve\n";
$t = auth_token_issue('customer', $FAKE_CUSTOMER, 'Pixel 8 / counter');
check('round-trips to the right subject', auth_token_resolve($t), ['subject_type' => 'customer', 'subject_id' => $FAKE_CUSTOMER]);
check('token has selector.validator shape', (bool)preg_match('/^[0-9a-f]{24}\.[0-9a-f]{64}$/', $t), true);

echo "\nvalidator is actually checked\n";
[$sel, $val] = explode('.', $t, 2);
check('tampered validator rejected', auth_token_resolve($sel . '.' . strrev($val)), null);
check('unknown selector rejected',   auth_token_resolve(str_repeat('a', 24) . '.' . $val), null);
check('malformed token rejected',    auth_token_resolve('no-dot-here'), null);
check('null token rejected',         auth_token_resolve(null), null);
check('empty token rejected',        auth_token_resolve(''), null);

echo "\nplaintext validator is never stored\n";
$row = db()->query("SELECT * FROM auth_tokens WHERE selector = " . db()->quote($sel))->fetch();
check('stored hash is not the validator', $row['validator_hash'] !== $val, true);
check('stored hash is sha256 of it',      $row['validator_hash'] === hash('sha256', $val), true);
check('last_used_at recorded',            $row['last_used_at'] !== null, true);
check('device_label kept',                $row['device_label'], 'Pixel 8 / counter');

echo "\nexpiry\n";
db()->prepare('UPDATE auth_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE selector = ?')->execute([$sel]);
check('expired token rejected', auth_token_resolve($t), null);

echo "\nrevoke\n";
$t2 = auth_token_issue('admin', $FAKE_ADMIN);
check('fresh admin token resolves', auth_token_resolve($t2)['subject_type'], 'admin');
auth_token_revoke($t2);
check('revoked token rejected', auth_token_resolve($t2), null);
check('revoking an unknown token does not throw', (function () { auth_token_revoke('aaaa.bbbb'); return true; })(), true);

echo "\nrevoke all\n";
$a = auth_token_issue('admin', $FAKE_ADMIN);
$b = auth_token_issue('admin', $FAKE_ADMIN);
check('two devices signed in', auth_token_resolve($a) !== null && auth_token_resolve($b) !== null, true);
auth_token_revoke_all('admin', $FAKE_ADMIN);
check('both revoked', auth_token_resolve($a) === null && auth_token_resolve($b) === null, true);

echo "\nsubject types are validated\n";
try { auth_token_issue('kitchen', 1); check('bad subject type throws', false, true); }
catch (InvalidArgumentException $e) { check('bad subject type throws', true, true); }

echo "\npurge removes expired and orphaned rows\n";
$orphan = auth_token_issue('customer', $FAKE_CUSTOMER);   // no such customer row exists
check('orphan resolves at token level', auth_token_resolve($orphan) !== null, true);
$removed = auth_tokens_purge();
check('purge removed at least the orphan and the expired one', $removed >= 2, true);
check('orphan gone after purge', auth_token_resolve($orphan), null);

echo "\nAuthorization header parsing\n";
$cases = [
    'Bearer abc.def'  => 'abc.def',
    'bearer abc.def'  => 'abc.def',
    '  Bearer   x.y ' => 'x.y',
    'Basic abc.def'   => null,
    'abc.def'         => null,
    ''                => null,
];
foreach ($cases as $header => $want) {
    $_SERVER['HTTP_AUTHORIZATION'] = $header;
    check("header " . var_export($header, true), auth_bearer_token(), $want);
}
unset($_SERVER['HTTP_AUTHORIZATION']);
check('no header at all', auth_bearer_token(), null);

// Cleanup.
db()->prepare('DELETE FROM auth_tokens WHERE subject_id IN (?, ?)')->execute([$FAKE_CUSTOMER, $FAKE_ADMIN]);
$left = db()->query('SELECT COUNT(*) FROM auth_tokens')->fetchColumn();

echo "\n$pass passed, $fail failed. Rows left in auth_tokens: $left\n";
exit($fail ? 1 : 0);

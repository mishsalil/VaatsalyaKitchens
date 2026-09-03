<?php
/* Verifies the fcm_tokens binding semantics against the running API. */
chdir(__DIR__ . '/..');
require_once 'includes/db.php';
require_once 'includes/tokens.php';

$API      = 'http://localhost:8081';
$CUSTOMER = 7;    // ZZ Test Customer
$ADMIN    = 21;   // staff

$pass = 0; $fail = 0;
function check(string $what, $got, $want) {
    global $pass, $fail;
    $ok = $got === $want;
    $ok ? $pass++ : $fail++;
    printf("  [%s] %s\n", $ok ? 'PASS' : 'FAIL', $what);
    if (!$ok) { echo "        got:  " . var_export($got, true) . "\n        want: " . var_export($want, true) . "\n"; }
}

function post(string $url, array $body, ?string $bearer): array {
    $headers = ['Content-Type: application/json'];
    if ($bearer) $headers[] = 'Authorization: Bearer ' . $bearer;
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => implode("\r\n", $headers),
        'content' => json_encode($body), 'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) { if (preg_match('#HTTP/\S+ (\d{3})#', $h, $m)) $code = (int)$m[1]; }
    return [$code, json_decode((string)$raw, true)];
}

function row(string $token): ?array {
    $st = db()->prepare('SELECT * FROM fcm_tokens WHERE token = ?');
    $st->execute([$token]);
    return $st->fetch() ?: null;
}

$TOKEN = 'vk-test-fcm-' . bin2hex(random_bytes(8));
db()->prepare('DELETE FROM fcm_tokens WHERE token = ?')->execute([$TOKEN]);

$custBearer  = auth_token_issue('customer', $CUSTOMER, 'fcm verify');
$adminBearer = auth_token_issue('admin',    $ADMIN,    'fcm verify');

echo "guest registration\n";
[$code] = post("$API/api/push/fcm", ['token' => $TOKEN], null);
check('accepted with no credential', 200, $code);
$r = row($TOKEN);
check('row created',            $r !== null, true);
check('customer_id is NULL',    $r['customer_id'], null);
check('admin_id is NULL',       $r['admin_id'], null);
check('last_seen_at recorded',  $r['last_seen_at'] !== null, true);

echo "\nsigned-in customer re-registers the same device\n";
[$code] = post("$API/api/push/fcm", ['token' => $TOKEN], $custBearer);
check('accepted', 200, $code);
$r = row($TOKEN);
check('now bound to the customer', (int)$r['customer_id'], $CUSTOMER);
check('still one row (upsert, not insert)', (int)db()->query('SELECT COUNT(*) FROM fcm_tokens WHERE token = ' . db()->quote($TOKEN))->fetchColumn(), 1);

echo "\nstaff registers the SAME phone\n";
[$code] = post("$API/api/admin/push/fcm", ['token' => $TOKEN], $adminBearer);
check('accepted', 200, $code);
$r = row($TOKEN);
check('bound to the admin',            (int)$r['admin_id'], $ADMIN);
check('customer binding NOT cleared',  (int)$r['customer_id'], $CUSTOMER);

echo "\nvalidation\n";
[$code] = post("$API/api/push/fcm", ['token' => ''], null);
check('empty token rejected', 400, $code);
[$code] = post("$API/api/push/fcm", ['token' => str_repeat('x', 300)], null);
check('over-long token rejected', 400, $code);
[$code] = post("$API/api/admin/push/fcm", ['token' => $TOKEN], null);
check('admin endpoint needs an admin', 401, $code);

echo "\nforeign keys behave as the migration claims\n";
db()->prepare('UPDATE fcm_tokens SET customer_id = ?, admin_id = ? WHERE token = ?')->execute([$CUSTOMER, $ADMIN, $TOKEN]);
// Simulate removing the staff member: CASCADE should delete the row.
db()->beginTransaction();
db()->prepare('DELETE FROM admin_users WHERE id = ?')->execute([$ADMIN]);
check('admin delete CASCADEs the token row', row($TOKEN), null);
db()->rollBack();   // never actually remove the staff account
check('rollback restored the row', row($TOKEN) !== null, true);

db()->prepare('DELETE FROM fcm_tokens WHERE token = ?')->execute([$TOKEN]);
db()->prepare("DELETE FROM auth_tokens WHERE device_label = 'fcm verify'")->execute();
echo "\n$pass passed, $fail failed\n";
echo 'cleanup: fcm test rows ' . db()->query('SELECT COUNT(*) FROM fcm_tokens WHERE token LIKE "vk-test-fcm-%"')->fetchColumn()
   . ', stray auth_tokens ' . db()->query("SELECT COUNT(*) FROM auth_tokens WHERE device_label = 'fcm verify'")->fetchColumn() . PHP_EOL;
exit($fail ? 1 : 0);

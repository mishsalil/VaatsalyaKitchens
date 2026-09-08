<?php
/* Exercises the dish photo upload/delete endpoints against the running API. */
chdir(__DIR__ . '/..');
require_once 'includes/db.php';
require_once 'includes/tokens.php';

$API = 'http://localhost:8081';
$ITEM = 24;                 // Veg Spring Roll — has a photo already
$DIR = 'web/public/menu';
$pass = 0; $fail = 0;
/* PHP caches stat() results, so a file deleted by the API still reads as
   present here unless the cache is cleared first. */
function fileThere(string $path): bool {
    clearstatcache(true, $path);
    return is_file($path);
}

function check($what, $got, $want) {
    global $pass, $fail;
    $ok = $got === $want; $ok ? $pass++ : $fail++;
    printf("  [%s] %s\n", $ok ? 'PASS' : 'FAIL', $what);
    if (!$ok) echo "        got: " . var_export($got, true) . "  want: " . var_export($want, true) . "\n";
}

// A tiny valid PNG (1x1) and a text file pretending to be one.
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$tmpPng = sys_get_temp_dir() . '/vk_test.png';
file_put_contents($tmpPng, $png);
$tmpTxt = sys_get_temp_dir() . '/vk_test_fake.png';
file_put_contents($tmpTxt, 'this is definitely not an image');

function upload(string $url, string $file, ?string $bearer, string $field = 'image'): array {
    $ch = curl_init($url);
    $headers = [];
    if ($bearer) $headers[] = 'Authorization: Bearer ' . $bearer;
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => [$field => new CURLFile($file)],
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode((string)$body, true)];
}

function post(string $url, ?string $bearer): int {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($bearer) $headers[] = 'Authorization: Bearer ' . $bearer;
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{}', CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

// Back up the real photo so the test cannot destroy it.
$backup = null;
if (is_file("$DIR/$ITEM.webp")) { $backup = file_get_contents("$DIR/$ITEM.webp"); }

$super = (int)db()->query("SELECT id FROM admin_users WHERE role IN ('super','admin') ORDER BY id LIMIT 1")->fetchColumn();
$rider = (int)db()->query("SELECT id FROM admin_users WHERE role = 'rider' ORDER BY id LIMIT 1")->fetchColumn();
$tokenSuper = auth_token_issue('admin', $super, 'upload test');
$tokenRider = $rider ? auth_token_issue('admin', $rider, 'upload test') : null;

echo "auth\n";
[$code] = upload("$API/api/admin/menu/upload_image/$ITEM", $tmpPng, null);
check('rejected with no credential', 401, $code);
if ($tokenRider) {
    [$code] = upload("$API/api/admin/menu/upload_image/$ITEM", $tmpPng, $tokenRider);
    check('rejected for a role without the menu cap', 403, $code);
}

echo "\nvalidation\n";
[$code, $body] = upload("$API/api/admin/menu/upload_image/$ITEM", $tmpTxt, $tokenSuper);
check('a non-image with a .png name is rejected', 400, $code);
[$code] = upload("$API/api/admin/menu/upload_image/999999", $tmpPng, $tokenSuper);
check('unknown item id is rejected', 404, $code);

echo "\nupload\n";
[$code, $body] = upload("$API/api/admin/menu/upload_image/$ITEM", $tmpPng, $tokenSuper);
check('accepted', 200, $code);
check('returns the served URL', "/menu/$ITEM.png", $body['url'] ?? null);
check('file written to disk', fileThere("$DIR/$ITEM.png"), true);
check('the previous .webp was removed (one photo per item)', fileThere("$DIR/$ITEM.webp"), false);

echo "\ndelete\n";
check('accepted', 200, post("$API/api/admin/menu/delete_image/$ITEM", $tokenSuper));
check('file gone', fileThere("$DIR/$ITEM.png"), false);

// Restore the real photo.
if ($backup !== null) { file_put_contents("$DIR/$ITEM.webp", $backup); }
@unlink($tmpPng); @unlink($tmpTxt);
db()->exec("DELETE FROM auth_tokens WHERE device_label = 'upload test'");

echo "\nrestored: " . (is_file("$DIR/$ITEM.webp") ? 'original photo back in place' : 'NOTHING TO RESTORE') . "\n";
echo "$pass passed, $fail failed\n";
exit($fail ? 1 : 0);

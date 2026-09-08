<?php
/* Three photo slots per dish: upload, list, and per-slot delete.
 * Complements dish-image-upload-test.php, which covers auth and validation. */

chdir(__DIR__ . '/..');
require_once 'includes/db.php';
require_once 'includes/tokens.php';
require_once 'api/lib/Response.php';
require_once 'includes/dish_photos.php';

$API  = 'http://localhost:8081';
$ITEM = 24;                    // Veg Spring Roll
$DIR  = 'web/public/menu';
$pass = 0; $fail = 0;

function fileThere(string $p): bool { clearstatcache(true, $p); return is_file($p); }
function check(string $what, $got, $want): void {
    global $pass, $fail;
    $ok = $got === $want; $ok ? $pass++ : $fail++;
    printf("  [%s] %s\n", $ok ? 'PASS' : 'FAIL', $what);
    if (!$ok) echo "        got: " . var_export($got, true) . "  want: " . var_export($want, true) . "\n";
}

function uploadSlot(string $api, int $item, int $slot, string $file, string $bearer): int {
    $ch = curl_init("$api/api/admin/menu/upload_image/$item");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['image' => new CURLFile($file), 'slot' => (string)$slot],
        CURLOPT_HTTPHEADER => ["Authorization: Bearer $bearer"],
        CURLOPT_RETURNTRANSFER => true,
    ]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

function deleteSlot(string $api, int $item, ?int $slot, string $bearer): int {
    $ch = curl_init("$api/api/admin/menu/delete_image/$item");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($slot === null ? [] : ['slot' => $slot]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $bearer"],
        CURLOPT_RETURNTRANSFER => true,
    ]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

// Preserve the real photo — this test overwrites slot 1.
$backup = fileThere("$DIR/$ITEM.webp") ? file_get_contents("$DIR/$ITEM.webp") : null;

$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$tmp = sys_get_temp_dir() . '/vk_slot.png';
file_put_contents($tmp, $png);

$admin = (int)db()->query("SELECT id FROM admin_users WHERE role IN ('super','admin') ORDER BY id LIMIT 1")->fetchColumn();
$token = auth_token_issue('admin', $admin, 'slots test');

echo "filling three slots\n";
check('slot 1 accepted', 200, uploadSlot($API, $ITEM, 1, $tmp, $token));
check('slot 2 accepted', 200, uploadSlot($API, $ITEM, 2, $tmp, $token));
check('slot 3 accepted', 200, uploadSlot($API, $ITEM, 3, $tmp, $token));
check('slot 1 has the bare filename', fileThere("$DIR/$ITEM.png"), true);
check('slot 2 is its own file', fileThere("$DIR/$ITEM-2.png"), true);
check('slot 3 is its own file', fileThere("$DIR/$ITEM-3.png"), true);

echo "\nout-of-range slots\n";
check('slot 4 refused', 400, uploadSlot($API, $ITEM, 4, $tmp, $token));
check('slot 0 refused', 400, uploadSlot($API, $ITEM, 0, $tmp, $token));

echo "\nthe public menu reports them\n";
$menu = json_decode((string)file_get_contents("$API/api/menu"), true);
$row = null;
foreach ($menu['items'] ?? [] as $i) { if ((int)$i['id'] === $ITEM) { $row = $i; break; } }
check('item found in /api/menu', $row !== null, true);
check('all three listed', count($row['photos'] ?? []), 3);
check('slot 1 first', $row['photos'][0] ?? '', "/menu/$ITEM.png");
check('then slot 2', $row['photos'][1] ?? '', "/menu/$ITEM-2.png");

echo "\ndeleting one slot leaves the others\n";
check('delete slot 2 accepted', 200, deleteSlot($API, $ITEM, 2, $token));
check('slot 2 gone', fileThere("$DIR/$ITEM-2.png"), false);
check('slot 1 untouched', fileThere("$DIR/$ITEM.png"), true);
check('slot 3 untouched', fileThere("$DIR/$ITEM-3.png"), true);

echo "\ndeleting with no slot clears them all\n";
check('accepted', 200, deleteSlot($API, $ITEM, null, $token));
check('slot 1 gone', fileThere("$DIR/$ITEM.png"), false);
check('slot 3 gone', fileThere("$DIR/$ITEM-3.png"), false);

// Restore.
if ($backup !== null) file_put_contents("$DIR/$ITEM.webp", $backup);
@unlink($tmp);
db()->exec("DELETE FROM auth_tokens WHERE device_label = 'slots test'");

echo "\nrestored: " . (fileThere("$DIR/$ITEM.webp") ? 'original photo back in place' : 'NOTHING TO RESTORE') . "\n";
echo "$pass passed, $fail failed\n";
exit($fail ? 1 : 0);

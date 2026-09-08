<?php
/* Dish photos — up to three per menu item, stored as files.
 *
 * NO DATABASE COLUMN, DELIBERATELY. A dish has a photo exactly when its file
 * exists, so the disk is the single source of truth and nothing can disagree
 * with it. The cost is an orphan file when an item is deleted: a few KB that
 * never render, which is cheaper than a column that can drift.
 *
 * NAMING. Slot 1 keeps the original {id}.{ext} so every photo that already
 * exists, and everything that already reads them, keeps working untouched.
 * Slots 2 and 3 are {id}-2.{ext} and {id}-3.{ext}.
 *
 * WHY THE API RETURNS THE LIST rather than the client probing: discovering
 * three slots across three extensions by attempting to load them would be up to
 * nine requests per dish, nearly all 404s, and the menu has over a hundred
 * dishes. One directory read per request answers it for every item at once.
 */

const DISH_PHOTO_SLOTS = 3;
const DISH_IMAGE_EXTS = ['webp', 'jpg', 'png'];

/**
 * Where the files live.
 *
 * In a checkout that is web/public/menu — what Vite serves and what the build
 * copies — so an upload shows up immediately in development. On the server
 * there is no web/ directory: the deploy ships the built bundle, so /menu sits
 * directly under the document root. The deploy excludes menu/ from --delete, so
 * uploads survive it.
 */
function dish_image_dir(): string
{
    $checkout = __DIR__ . '/../web/public/menu';
    if (is_dir($checkout)) {
        return $checkout;
    }
    $root = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), "/\\");
    if ($root === '') {
        return '';
    }
    return $root . '/menu';
}

/** Filename for one slot. Slot 1 is bare, so it matches what already exists. */
function dish_photo_filename(int $id, int $slot, string $ext): string
{
    return $slot <= 1 ? "$id.$ext" : "$id-$slot.$ext";
}

/**
 * Every dish photo on disk, as [item id => [slot => url]], from ONE directory
 * read. Slots are sorted so callers get them in order.
 */
function dish_photo_map(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $dir = dish_image_dir();
    $cached = [];
    if ($dir === '' || !is_dir($dir)) {
        return $cached;
    }

    $exts = implode('|', DISH_IMAGE_EXTS);
    foreach (scandir($dir) ?: [] as $file) {
        if (!preg_match('/^(\d+)(?:-([2-9]))?\.(' . $exts . ')$/i', $file, $m)) {
            continue;
        }
        $id = (int)$m[1];
        $slot = $m[2] !== '' ? (int)$m[2] : 1;
        if ($slot > DISH_PHOTO_SLOTS) {
            continue;
        }
        // One file per slot: if both .webp and .jpg somehow exist, the order of
        // DISH_IMAGE_EXTS decides, matching what the browser would resolve.
        if (isset($cached[$id][$slot])) {
            continue;
        }
        $cached[$id][$slot] = '/menu/' . $file;
    }

    foreach ($cached as &$slots) {
        ksort($slots);
    }
    unset($slots);

    return $cached;
}

/** Ordered photo URLs for one item — [] when it has none. */
function dish_photos(int $id): array
{
    return array_values(dish_photo_map()[$id] ?? []);
}

/** Remove one slot's photo, or every slot when $slot is null. */
function delete_dish_image(int $id, ?int $slot = null): void
{
    $dir = dish_image_dir();
    if ($dir === '') {
        return;
    }
    $slots = $slot !== null ? [$slot] : range(1, DISH_PHOTO_SLOTS);
    foreach ($slots as $s) {
        foreach (DISH_IMAGE_EXTS as $ext) {
            $path = $dir . '/' . dish_photo_filename($id, $s, $ext);
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }
}

/**
 * Validate and store an uploaded photo into one slot. Returns its URL.
 *
 * NO SERVER-SIDE RESIZE: neither GD nor Imagick is guaranteed on this stack
 * (this machine has neither), so the admin shrinks the picture in the browser
 * before sending. The limits here are the backstop for anything that arrives
 * unshrunk, and Response::error() ends the request.
 */
function save_dish_image(int $id, int $slot): string
{
    if ($slot < 1 || $slot > DISH_PHOTO_SLOTS) {
        Response::error('Invalid photo slot.');
    }
    if (empty($_FILES['image']) || ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        Response::error('Please choose a photo.');
    }
    $f = $_FILES['image'];
    if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        Response::error('Upload failed. Please try a smaller photo.');
    }
    if ($f['size'] > 3 * 1024 * 1024) {
        Response::error('Photo must be 3 MB or smaller.');
    }

    // Trust finfo over the client-supplied type, as the logo upload does.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $extByMime = ['image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png'];
    $mime = $finfo->file($f['tmp_name']);
    if (!isset($extByMime[$mime])) {
        Response::error('Photo must be a WebP, JPG or PNG.');
    }
    $ext = $extByMime[$mime];

    /* getimagesize is core PHP and needs no GD. It confirms the file really
       decodes as an image: a MIME type alone can be forged by prefixing image
       bytes to something else. */
    $size = @getimagesize($f['tmp_name']);
    if ($size === false || $size[0] < 1 || $size[1] < 1) {
        Response::error('That file is not a readable image.');
    }
    if ($size[0] > 4000 || $size[1] > 4000) {
        Response::error('Photo is too large. Please use one under 4000 pixels.');
    }

    $dir = dish_image_dir();
    if ($dir === '') {
        Response::error('Cannot determine where to store the photo.', 500);
    }
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        Response::error('Could not create the photo directory.', 500);
    }

    // One file per slot: clear the other extensions so a stale .jpg cannot
    // outrank a new .webp, which the browser would resolve first.
    delete_dish_image($id, $slot);

    $name = dish_photo_filename($id, $slot, $ext);
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) {
        Response::error('Could not save the photo.', 500);
    }
    return "/menu/$name";
}

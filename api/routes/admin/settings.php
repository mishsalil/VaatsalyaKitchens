<?php
/* Admin settings: branding/contact, logo upload, print header, password.

   GET  /api/admin/settings                       → {settings, admin, vapid_configured}
   POST /api/admin/settings/update                {kitchen_name, kitchen_address,
                                                   kitchen_whatsapp, kitchen_phone_display,
                                                   kitchen_email, gstin, print_footer,
                                                   gst_rate, google_maps_key}
   POST /api/admin/settings/upload_logo           (multipart: logo=file) → {logo_path}
   POST /api/admin/settings/change_password       {current, new}

   Secrets are never touched here: VAPID private key, DB creds and base_url stay
   in config.php. Only the editable presentation values above are persisted. */
require_once __DIR__ . '/../../../includes/settings.php';
require_once __DIR__ . '/../../../includes/push.php';

function route($method, $action, $parts): void
{
    $admin = require_admin_api();

    // Branding/print settings require the `settings` cap. change_password is
    // self-service for every signed-in admin (any role), so it is NOT gated
    // here — it is allowed through and only verifies the current password.
    if ($action !== 'change_password' && !admin_can($admin, 'settings')) {
        json_error('You do not have permission to do that.', 403);
    }

    if ($action === 'index' && $method === 'GET') {
        Response::json([
            'settings'         => all_settings(),
            'admin'            => ['id' => (int)$admin['id'], 'username' => $admin['username']],
            'vapid_configured' => push_configured(),
        ]);
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    if ($action === 'update') {
        $name     = mb_substr(trim((string)($_POST['kitchen_name'] ?? '')), 0, 120) ?: 'Vaatsalya Kitchens';
        $address  = mb_substr(trim((string)($_POST['kitchen_address'] ?? '')), 0, 500);
        $whatsapp = normalize_setting_phone($_POST['kitchen_whatsapp'] ?? '');
        if ($whatsapp === null) {
            Response::error('WhatsApp number must be a valid 10-digit mobile.');
        }
        $phoneDisplay = mb_substr(trim((string)($_POST['kitchen_phone_display'] ?? '')), 0, 40);
        if ($phoneDisplay === '') {
            Response::error('Please enter a display phone number.');
        }
        $email = mb_substr(trim((string)($_POST['kitchen_email'] ?? '')), 0, 190);
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.');
        }
        $gstin = mb_strtoupper(mb_substr(trim((string)($_POST['gstin'] ?? '')), 0, 15));
        if ($gstin !== '' && !preg_match('/^[A-Z0-9]{15}$/', $gstin)) {
            Response::error('GSTIN must be 15 letters/digits, or blank.');
        }
        $footer = mb_substr(trim((string)($_POST['print_footer'] ?? '')), 0, 500);

        // Tax-exclusive GST rate (percent), split equally SGST/CGST. 0 disables GST.
        $gstRateRaw = trim((string)($_POST['gst_rate'] ?? ''));
        $gstRate = $gstRateRaw === '' ? 0.0 : (float)$gstRateRaw;
        if ($gstRateRaw !== '' && (!is_numeric($gstRateRaw) || $gstRate < 0 || $gstRate > 100)) {
            Response::error('GST rate must be a number 0–100.');
        }
        $gstRate = round($gstRate, 2);

        $mapsKey = mb_substr(trim((string)($_POST['google_maps_key'] ?? '')), 0, 120);
        if ($mapsKey !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $mapsKey)) {
            Response::error('That does not look like a Google API key.');
        }

        $mapsKeyApp = mb_substr(trim((string)($_POST['google_maps_key_app'] ?? '')), 0, 120);
        if ($mapsKeyApp !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $mapsKeyApp)) {
            Response::error('That does not look like a Google API key (app).');
        }
        $reviewUrl = mb_substr(trim((string)($_POST['google_review_url'] ?? '')), 0, 300);
        if ($reviewUrl !== '' && !preg_match('#^https://([a-z0-9-]+\.)*(google\.com|g\.page|goo\.gl)/#i', $reviewUrl)) {
            Response::error('The Google review link should start with https://g.page/ or https://search.google.com/');
        }
        $placeId = mb_substr(trim((string)($_POST['google_place_id'] ?? '')), 0, 200);
        if ($placeId !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $placeId)) {
            Response::error('That does not look like a Google Place ID.');
        }

        set_setting('kitchen_name', $name);
        set_setting('kitchen_address', $address);
        set_setting('kitchen_whatsapp', $whatsapp);
        set_setting('kitchen_phone_display', $phoneDisplay);
        set_setting('kitchen_email', $email);
        set_setting('gstin', $gstin);
        set_setting('print_footer', $footer);
        set_setting('gst_rate', (string)$gstRate);
        set_setting('google_maps_key', $mapsKey);
        set_setting('google_maps_key_app', $mapsKeyApp);
        set_setting('google_review_url', $reviewUrl);
        set_setting('google_place_id', $placeId);

        // bust the all_settings() in-process cache so the response is fresh
        Response::json(['ok' => true, 'settings' => all_settings_fresh()]);
    }

    if ($action === 'upload_logo') {
        $logoPath = save_uploaded_logo();
        set_setting('logo_path', $logoPath);
        Response::json(['ok' => true, 'logo_path' => $logoPath]);
    }

    if ($action === 'change_password') {
        $current = (string)($_POST['current'] ?? '');
        $new     = (string)($_POST['new'] ?? '');
        if (strlen($new) < 8) {
            Response::error('New password must be at least 8 characters.');
        }
        if (!password_verify($current, $admin['password_hash'])) {
            rate_limit_admin_password($admin['username']);
            Response::error('Current password is incorrect.');
        }
        db()->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
        Response::success('Password changed');
    }

    Response::error('Method not allowed', 405);
}

/** Coerces 10/11/12-digit input to 91XXXXXXXXXX; null on bad input. */
function normalize_setting_phone($v): ?string
{
    $d = preg_replace('/\D/', '', (string)$v);
    if (strlen($d) === 10) {
        $d = '91' . $d;
    } elseif (strlen($d) === 11 && str_starts_with($d, '0')) {
        $d = '91' . substr($d, 1);
    } elseif (strlen($d) === 12 && str_starts_with($d, '91')) {
        // already normalized
    } else {
        return null;
    }
    return $d;
}

function rate_limit_admin_password(string $username): void
{
    $identifier = 'admin:' . $username . ':' . ($_SERVER['REMOTE_ADDR'] ?? '');
    db()->prepare('INSERT INTO login_attempts (identifier) VALUES (?)')->execute([$identifier]);
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM login_attempts
          WHERE identifier = ? AND attempted_at > (NOW() - INTERVAL 10 MINUTE)'
    );
    $stmt->execute([$identifier]);
    if ((int)$stmt->fetchColumn() > 5) {
        Response::error('Too many attempts. Please try again in a few minutes.', 429);
    }
}

/**
 * Where the logo lives — the same dev/prod split as dish_image_dir().
 *
 * In a checkout it is web/public/branding, which Vite serves and the build
 * copies. On the server there is NO web/ directory: the deploy flattens the
 * built bundle into the document root, so /branding sits directly under it.
 * Writing to the checkout path there produced a logo the server never served,
 * while logo_path in the database pointed at /branding/logo.png regardless.
 */
function branding_dir(): string
{
    /* Detect a checkout by web/src, NOT by web/public: the old code mkdir'd
       web/public/branding on the server, so that directory now exists there
       and would keep swallowing uploads. Only a real checkout has sources. */
    $web = __DIR__ . '/../../../web';
    if (is_dir($web . '/src')) {
        return $web . '/public/branding';
    }
    $root = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), "/\\");
    return $root === '' ? '' : $root . '/branding';
}

/** Longest side we keep. A header logo never needs more; a 1600px design
 *  export was 489 KB and a 1.9 MB one made the CDN's optimiser give up. */
const LOGO_MAX_PX = 800;

/**
 * Save an uploaded logo and return its URL path (/branding/logo.<ext>).
 *
 * Raster logos are decoded and re-encoded through GD when it is available:
 * that shrinks anything over LOGO_MAX_PX and normalises exotic PNGs (16-bit,
 * interlaced, huge) into a plain file every CDN can read. Without GD the file
 * is validated with getimagesize and stored as-is, with a dimension cap so an
 * unreadable-to-the-CDN giant is refused rather than silently broken. SVG is
 * text and passes through untouched either way.
 */
function save_uploaded_logo(): string
{
    if (empty($_FILES['logo']) || ($_FILES['logo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        Response::error('Please choose a logo file.');
    }
    $f = $_FILES['logo'];
    if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        Response::error('Upload failed. Please try a smaller file.');
    }
    if ($f['size'] > 2 * 1024 * 1024) {
        Response::error('Logo must be 2 MB or smaller.');
    }

    // Trust the MIME from finfo, not the client-supplied type.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($f['tmp_name']);
    $extByMime = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
    ];
    if (!isset($extByMime[$mime])) {
        Response::error('Logo must be a JPG, PNG, WebP, or SVG.');
    }
    $ext = $extByMime[$mime];

    /* Rasters must really decode. A MIME type alone can be forged by prefixing
       image bytes to something else, and getimagesize is core PHP. */
    $size = null;
    if ($ext !== 'svg') {
        $size = @getimagesize($f['tmp_name']);
        if ($size === false || $size[0] < 1 || $size[1] < 1) {
            Response::error('That file is not a readable image.');
        }
    }

    $dir = branding_dir();
    if ($dir === '') {
        Response::error('Cannot determine where to store the logo.', 500);
    }
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        Response::error('Could not create branding directory.', 500);
    }

    /* Re-encode through GD when we can. Anything wider than LOGO_MAX_PX is
       scaled down, and the output is always a plain 8-bit PNG with alpha —
       the one raster format every browser and CDN agrees on. */
    $gd = $ext !== 'svg' && function_exists('imagecreatefromstring') && function_exists('imagepng');
    if ($gd) {
        $img = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
        if ($img === false) {
            Response::error('That image could not be decoded.');
        }
        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, LOGO_MAX_PX / max($w, $h));
        if ($scale < 1) {
            /* imagecopyresampled rather than imagescale: the first version used
               imagescale(..., IMG_BICUBIC), which returned false on the host's
               GD build — not every build supports that mode — and the upload
               died with "Could not resize the logo". imagecopyresampled has
               been in GD forever. The destination is set up for alpha before
               copying, or a transparent logo comes out on black. */
            $nw = max(1, (int)round($w * $scale));
            $nh = max(1, (int)round($h * $scale));
            $resized = imagecreatetruecolor($nw, $nh);
            if ($resized === false) {
                imagedestroy($img);
                Response::error(sprintf('Could not resize the logo (%dx%d, GD %s).', $w, $h, gd_info()['GD Version'] ?? '?'), 500);
            }
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            imagefill($resized, 0, 0, imagecolorallocatealpha($resized, 0, 0, 0, 127));
            if (!imagecopyresampled($resized, $img, 0, 0, 0, 0, $nw, $nh, $w, $h)) {
                imagedestroy($img);
                imagedestroy($resized);
                Response::error(sprintf('Could not resize the logo (%dx%d, GD %s).', $w, $h, gd_info()['GD Version'] ?? '?'), 500);
            }
            imagedestroy($img);
            $img = $resized;
        }
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $ext = 'png';
    } elseif ($ext !== 'svg' && ($size[0] > 2000 || $size[1] > 2000)) {
        Response::error('Logo is too large. Please use one under 2000 pixels on each side.');
    }

    // Single canonical filename per type; overwrite previous logo. Remove any
    // previously-saved logo of a different extension so only one is kept.
    foreach (['jpg', 'png', 'webp', 'svg'] as $old) {
        if ($old !== $ext && is_file("$dir/logo.$old")) {
            @unlink("$dir/logo.$old");
        }
    }
    $dest = "$dir/logo.$ext";
    $saved = $gd ? imagepng($img, $dest, 9) : move_uploaded_file($f['tmp_name'], $dest);
    if ($gd) {
        imagedestroy($img);
    }
    if (!$saved) {
        Response::error('Could not save the logo.', 500);
    }
    return '/branding/logo.' . $ext;
}

/** all_settings() with a fresh DB read (cache bypassed after a write). */
function all_settings_fresh(): array
{
    return (function () {
        $out = settings_defaults();
        $rows = db()->query('SELECT `key`, `value` FROM settings')->fetchAll();
        foreach ($rows as $r) {
            $out[$r['key']] = $r['value'];
        }
        return $out;
    })();
}
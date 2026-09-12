<?php
/* Editable settings (branding / contact / print header) backed by the
   `settings` table, with a config.php fallback. Secrets (VAPID private key,
   DB credentials, base_url) stay in config.php and are NEVER read or written
   here — this layer only covers user-editable presentation values.

   Usage:
     $name = setting('kitchen_name', 'Vaatsalya Kitchens');
     $all  = all_settings();     // merged defaults + DB overrides
     set_setting('gstin', '29ABCDE1234F1Z5');
*/

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

/** Effective default map: config.php where it exists, sensible blanks otherwise. */
function settings_defaults(): array
{
    $cfg = config();
    return [
        'kitchen_name'         => 'Vaatsalya Kitchens',
        'kitchen_address'      => '',
        'kitchen_whatsapp'     => $cfg['kitchen_whatsapp'] ?? '',
        'kitchen_phone_display'=> $cfg['kitchen_phone_display'] ?? '',
        'kitchen_email'        => $cfg['kitchen_email'] ?? '',
        'logo_path'            => null,
        'gstin'                => '',
        'print_footer'         => 'Thank you for ordering with Vaatsalya Kitchens!',
        // Tax-exclusive GST rate (percent), split equally SGST/CGST.
        'gst_rate'             => '5',
        /* Smallest order we accept, in rupees, checked against the pre-tax
           subtotal. Stated in the Shipping & Delivery and Terms pages, so
           changing it here changes what those pages promise. "0" disables it.
           Bulk and party minimums are not enforced here — those are agreed on
           the phone, not placed through the cart. */
        'min_order_value'      => '199',
        /* Google Maps JavaScript API key for the customer's address picker.
           A SETTING, not a build variable: the counter phones run a packaged
           APK, and baking it in would mean a new APK to rotate it. Blank means
           the picker falls back to a plain textarea. It is public by design (it
           runs in the browser); the referrer restriction in Google Cloud is
           what protects it. */
        'google_maps_key'      => '',
        /* A second key for the Android app. The website's key is restricted to
           the referrer vaatsalyakitchens.in; the app serves the storefront from
           https://localhost, which that restriction refuses. Blank = the app
           uses the website's key. */
        'google_maps_key_app'  => '',
        /* Google Business Profile. The review URL is the "Ask for reviews" link
           (g.page/r/…/review) — one tap opens the review box already pointed
           at the kitchen. The Place ID lets the storefront show the live Google
           rating. Both blank = neither feature appears. */
        'google_review_url'    => '',
        'google_place_id'      => '',
    ];
}

/** All settings merged: defaults overridden by any rows present in the table. */
function all_settings(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $out = settings_defaults();
    try {
        $rows = db()->query('SELECT `key`, `value` FROM settings')->fetchAll();
        foreach ($rows as $r) {
            // A row present (even with NULL value) counts as the override.
            $out[$r['key']] = $r['value'];
        }
    } catch (Throwable $e) {
        // fall through with defaults if the table isn't there yet
    }
    return $cache = $out;
}

function setting(string $key, ?string $default = null): ?string
{
    $all = all_settings();
    $val = $all[$key] ?? null;
    return $val !== null ? $val : $default;
}

function set_setting(string $key, ?string $value): void
{
    db()->prepare(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
    )->execute([$key, $value]);
}
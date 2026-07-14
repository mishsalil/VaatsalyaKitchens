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
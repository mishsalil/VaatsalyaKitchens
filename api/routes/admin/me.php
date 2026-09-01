<?php
/* GET /api/admin/me — current admin (or null) + CSRF token + public settings.
   The admin SPA bootstraps from this (token + whether already signed in).
   No CSRF required here, mirroring the customer /api/me. */
require_once __DIR__ . '/../../../includes/settings.php';

function route($method, $action, $parts): void
{
    if ($method !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    $cfg = config();
    $admin = current_admin();
    Response::json([
        'admin' => $admin ? [
            'id'       => (int)$admin['id'],
            'username' => $admin['username'],
            'role'     => (string)($admin['role'] ?? 'staff'),
        ] : null,
        'csrf_token' => csrf_token(),
        'settings' => [
            'kitchen_whatsapp'      => $cfg['kitchen_whatsapp'],
            'kitchen_phone_display' => $cfg['kitchen_phone_display'],
            'kitchen_email'         => $cfg['kitchen_email'],
            'base_url'              => $cfg['base_url'],
            'push_configured'       => !empty($cfg['vapid']['public_key']) && !empty($cfg['vapid']['private_key']),
            // Needed by the counter New Order cart to preview the GST split
            // without holding the `settings` cap (staff do not have it).
            'gst_rate'              => (string)setting('gst_rate', '0'),
            // Receipt letterhead. /api/admin/settings is gated on the `settings`
            // cap, which staff lack — yet every role has `print`, so the receipt
            // reads its header from here instead. Presentation values only; the
            // settings table never holds secrets (see includes/settings.php).
            'print_header' => [
                'kitchen_name'          => (string)setting('kitchen_name', 'Vaatsalya Kitchens'),
                'kitchen_address'       => (string)setting('kitchen_address', ''),
                'kitchen_phone_display' => (string)setting('kitchen_phone_display', ''),
                'kitchen_email'         => (string)setting('kitchen_email', ''),
                'gstin'                 => (string)setting('gstin', ''),
                'print_footer'          => (string)setting('print_footer', ''),
                'logo_path'             => setting('logo_path', null),
            ],
        ],
    ]);
}
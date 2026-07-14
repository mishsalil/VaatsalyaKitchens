<?php
/* GET /api/admin/me — current admin (or null) + CSRF token + public settings.
   The admin SPA bootstraps from this (token + whether already signed in).
   No CSRF required here, mirroring the customer /api/me. */
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
        ],
    ]);
}
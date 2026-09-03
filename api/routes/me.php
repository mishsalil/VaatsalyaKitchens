<?php
/* GET /api/me — current customer (or null) + CSRF token + public settings.
   Contact/branding/logo are sourced from the editable settings table (with a
   config.php fallback) so the admin Settings page updates the storefront live. */
require_once __DIR__ . '/../../includes/settings.php';

function route($method, $action, $parts): void
{
    if ($method !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    $cfg = config();
    $branchId = $cfg['default_branch_id'] ?? 1;
    $s = all_settings();

    $stmt = db()->prepare('SELECT id, name, phone, whatsapp, email, address FROM branches WHERE id = ?');
    $stmt->execute([$branchId]);
    $branch = $stmt->fetch();

    $customer = current_customer();
    $vapid = $cfg['vapid'] ?? [];
    Response::json([
        'user' => $customer ? [
            'id'      => (int)$customer['id'],
            'name'    => $customer['name'],
            'phone'   => $customer['phone'],
            'has_pin' => !empty($customer['pin_hash']),
        ] : null,
        'settings' => [
            'kitchen_name'          => $s['kitchen_name'],
            'kitchen_address'       => $s['kitchen_address'],
            'kitchen_whatsapp'      => $s['kitchen_whatsapp'],
            'kitchen_phone_display' => $s['kitchen_phone_display'],
            'kitchen_email'         => $s['kitchen_email'],
            'logo_path'             => $s['logo_path'],
            'gst_rate'              => (string)($s['gst_rate'] ?? '0'),
            'base_url'              => $cfg['base_url'],
            // Web Push config — the SPA subscribes on site open (not only after
            // an order), so the public key must be reachable before login.
            'vapid_public_key'      => !empty($vapid['public_key']) ? $vapid['public_key'] : '',
            'push_configured'       => !empty($vapid['public_key']) && !empty($vapid['private_key']),
            'branch' => $branch ? [
                'id'       => (int)$branch['id'],
                'name'     => $branch['name'],
                'phone'    => $branch['phone'],
                'whatsapp' => $branch['whatsapp'],
            ] : null,
        ],
    ]);
}
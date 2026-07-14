<?php
/* Admin authentication for the admin REST API (/api/admin/*).

   The old server-rendered admin panel (admin/*.php + admin_header/admin_footer
   page chrome + the require_admin() redirect variant) was removed in the
   cutover to the React admin SPA. What remains here is the session/auth core
   reused by the API: a separate VKADMIN session, current_admin(), and the
   require_admin_api() JSON-401 guard. Customer auth is unaffected (separate
   PHPSESSID session). */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/csrf.php';

function admin_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('VKADMIN');
    session_start();
}

function current_admin(): ?array
{
    admin_session_start();
    if (empty($_SESSION['admin_id'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM admin_users WHERE id = ?');
    $stmt->execute([(int)$_SESSION['admin_id']]);
    return $stmt->fetch() ?: null;
}

/** JSON-API guard: 401 envelope instead of a redirect. For /api/admin/*. */
function require_admin_api(): array
{
    header('X-Robots-Tag: noindex, nofollow');
    $admin = current_admin();
    if (!$admin) {
        json_error('Please sign in as admin.', 401);
    }
    return $admin;
}
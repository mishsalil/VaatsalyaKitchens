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
require_once __DIR__ . '/tokens.php';

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

/** Returns the signed-in admin row or null.
 *
 *  Accepts `Authorization: Bearer` ahead of the VKADMIN session, on the same
 *  terms as current_customer(): a present token is authoritative, so an expired
 *  one yields a 401 instead of silently falling back to a cookie.
 *
 *  Admin and customer tokens are separate subject types held in separate client
 *  storage slots, which preserves today's behaviour — the VKADMIN and PHPSESSID
 *  cookies are independent, so a rep can be signed in as staff and as a customer
 *  at once. A customer token presented here authenticates nobody. */
function current_admin(): ?array
{
    $bearer = auth_bearer_token();
    if ($bearer !== null) {
        $claim = auth_token_resolve($bearer);
        if (!$claim || $claim['subject_type'] !== 'admin') {
            return null;
        }
        $stmt = db()->prepare('SELECT * FROM admin_users WHERE id = ?');
        $stmt->execute([$claim['subject_id']]);
        return $stmt->fetch() ?: null;   // fails closed if the staff member was removed
    }

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
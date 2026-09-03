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
require_once __DIR__ . '/tokens.php';

/** Returns the signed-in admin row, or null.
 *
 *  Admin and customer tokens are separate subject types held in separate client
 *  storage slots, preserving what the independent VKADMIN and PHPSESSID cookies
 *  gave: a rep can be signed in as staff and as a customer at once. A customer
 *  token presented here authenticates nobody. */
function current_admin(): ?array
{
    $claim = auth_token_resolve(auth_bearer_token());
    if (!$claim || $claim['subject_type'] !== 'admin') {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM admin_users WHERE id = ?');
    $stmt->execute([$claim['subject_id']]);
    return $stmt->fetch() ?: null;   // fails closed if the staff member was removed
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
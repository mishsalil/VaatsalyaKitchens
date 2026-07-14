<?php
/* Admin RBAC — roles + capabilities (server-side source of truth).

   5 roles: super, admin, manager, staff, rider. Each maps to a set of
   capability strings. require_admin_cap($cap) authenticates the admin (401 if
   none signed in) and 403-JSONs if the admin's role lacks the cap. Role is a
   VARCHAR(20) column on admin_users (migration_003_rbac.sql); current_admin()
   already does SELECT *, so the column flows through with no query changes.

   Capability strings:
     dashboard  orders  menu  customers  broadcast  settings  roles  print
   "change own password" is intentionally NOT a cap — it is self-service for
   every signed-in admin (handled in settings.php::change_password, no cap).
   The rider's "can only mark Delivered" restriction is NOT a cap either — it
   is enforced inline in orders.php::update_status (rider + status!=='delivered'
   => 403). Rider still has the `orders` cap so it can view the board. */

require_once __DIR__ . '/admin_auth.php';

/** Canonical role slugs in hierarchical order (broadest first). */
function admin_roles(): array
{
    return ['super', 'admin', 'manager', 'staff', 'rider'];
}

function admin_role_label(string $role): string
{
    return match ($role) {
        'super'   => 'Super',
        'admin'   => 'Admin',
        'manager' => 'Manager',
        'staff'   => 'Staff',
        'rider'   => 'Delivery Rider',
        default   => ucfirst($role),
    };
}

function admin_role_valid(string $role): bool
{
    return in_array($role, admin_roles(), true);
}

/** role -> capability strings granted to that role. */
function admin_caps_for_role(string $role): array
{
    return match ($role) {
        'super'   => ['dashboard', 'orders', 'menu', 'customers', 'broadcast', 'settings', 'roles', 'print'],
        'admin'   => ['dashboard', 'orders', 'menu', 'customers', 'broadcast', 'settings', 'print'],
        'manager' => ['dashboard', 'orders', 'menu', 'broadcast', 'print'],
        'staff'   => ['dashboard', 'orders', 'print'],
        'rider'   => ['dashboard', 'orders', 'print'],
        default   => ['dashboard'],
    };
}

/** Capabilities for an admin row (reads the `role` column, falls back to staff). */
function admin_caps(array $admin): array
{
    return admin_caps_for_role((string)($admin['role'] ?? 'staff'));
}

function admin_can(array $admin, string $cap): bool
{
    return in_array($cap, admin_caps($admin), true);
}

/** Authenticate (401 JSON if no admin) and require a capability (403 JSON if the
    admin's role lacks it). Returns the admin row. Used by /api/admin/* actions
    in place of bare require_admin_api() where a cap applies. */
function require_admin_cap(string $cap): array
{
    header('X-Robots-Tag: noindex, nofollow');
    $admin = current_admin();
    if (!$admin) {
        json_error('Please sign in as admin.', 401);
    }
    if (!admin_can($admin, $cap)) {
        json_error('You do not have permission to do that.', 403);
    }
    return $admin;
}
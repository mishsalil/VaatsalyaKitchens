/* Admin RBAC — client-side mirror of includes/admin_roles.php.

   The server is the source of truth and enforces every cap on /api/admin/*.
   This module only drives UX: which nav items show, which routes are guarded,
   and which status buttons the rider sees. Never rely on it for security. */

export type AdminRole = 'super' | 'admin' | 'manager' | 'staff' | 'rider';

export type AdminCap =
  | 'dashboard'
  | 'orders'
  /** Counter order entry. Staff have it; riders deliberately do not. */
  | 'new_order'
  | 'menu'
  | 'customers'
  | 'broadcast'
  | 'settings'
  | 'roles'
  | 'print';

/** Canonical role slugs in hierarchical order (broadest first). */
export const ROLES: AdminRole[] = ['super', 'admin', 'manager', 'staff', 'rider'];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super: 'Super',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  rider: 'Delivery Rider',
};

const CAPS_BY_ROLE: Record<AdminRole, AdminCap[]> = {
  super: ['dashboard', 'orders', 'new_order', 'menu', 'customers', 'broadcast', 'settings', 'roles', 'print'],
  admin: ['dashboard', 'orders', 'new_order', 'menu', 'customers', 'broadcast', 'settings', 'print'],
  manager: ['dashboard', 'orders', 'new_order', 'menu', 'broadcast', 'print'],
  staff: ['dashboard', 'orders', 'new_order', 'print'],
  rider: ['dashboard', 'orders', 'print'],
};

/** Caps granted to a role. Unknown roles fall back to dashboard-only. */
export function capsForRole(role: string): AdminCap[] {
  return (CAPS_BY_ROLE as Record<string, AdminCap[]>)[role] ?? ['dashboard'];
}

/** Does the given role have the cap? */
export function can(role: string | undefined | null, cap: AdminCap): boolean {
  if (!role) return false;
  return capsForRole(role).includes(cap);
}

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
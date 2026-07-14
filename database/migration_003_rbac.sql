-- migration_003_rbac.sql — Admin RBAC: add a role column to admin_users.
--
-- 5 roles (validated in app code, includes/admin_roles.php — NOT a MySQL ENUM,
-- so new roles can be added without a migration):
--   super   — full power, incl. Team / role management
--   admin   — everything except Team / role management
--   manager — dashboard, orders, menu, broadcast
--   staff   — dashboard, orders
--   rider   — dashboard, orders (view all; can only mark Delivered)
--
-- Defaults to 'staff' for any future seed; the existing seeded `admin` user is
-- the kitchen owner, so promote it to 'super'.

ALTER TABLE admin_users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'staff' AFTER username;

UPDATE admin_users SET role = 'super' WHERE username = 'admin';
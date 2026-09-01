-- migration_008_cancel_alerts.sql
-- Telling the kitchen an order was cancelled, and proving someone did.
--
-- 1. admin_push_subscriptions — push for STAFF devices.
--    push_subscriptions is customer-only (its customer_id is a FK to customers)
--    and nothing pushed to admins at all. A separate table rather than an
--    admin_id column on the existing one, because the endpoint there is UNIQUE:
--    a rep's own phone is often also their customer device, and one row per
--    endpoint would make the admin registration overwrite their customer one
--    (or the reverse), silently costing them order updates.
--
-- 2. orders.cancel_acked_* — the human confirmation.
--    A push can be missed, dismissed, or land on a phone in someone's bag. The
--    kitchen is told by a person walking over and saying so, so a cancelled
--    order stays flagged on the board until a rep explicitly confirms they did
--    that. The name and time are recorded — "who told the kitchen?" has an
--    answer later, not just "a notification was sent".

CREATE TABLE admin_push_subscriptions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id   INT UNSIGNED NOT NULL,
  endpoint   VARCHAR(500) NOT NULL,
  p256dh     VARCHAR(255) NOT NULL,
  auth_key   VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_push_endpoint (endpoint(191)),
  KEY idx_admin_push_admin (admin_id),
  CONSTRAINT fk_admin_push_admin FOREIGN KEY (admin_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE orders
  ADD COLUMN cancel_acked_at    DATETIME NULL AFTER is_complimentary,
  ADD COLUMN cancel_acked_by    INT UNSIGNED NULL AFTER cancel_acked_at,
  ADD COLUMN cancel_acked_label VARCHAR(120) NULL AFTER cancel_acked_by;

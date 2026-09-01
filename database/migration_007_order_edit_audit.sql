-- migration_007_order_edit_audit.sql
-- Editing and cancelling orders, with an audit trail.
--
-- 1. order_items gains the menu ids behind each line.
--    Lines were snapshot-only (item_name / variant_name / addons_text), which is
--    right for a frozen bill and is why ReorderButton has to match on NAME and
--    calls itself best-effort. That is not good enough to EDIT an order: a
--    renamed or withdrawn dish would silently drop or re-map a line and then be
--    re-saved as a new bill. The ids make reconstruction exact.
--    NULL on every pre-existing row — the edit screen falls back to name
--    matching for those and warns that the line could not be resolved.
--
-- 2. order_events records who changed an order and how.
--    These are GST invoices and staff can now alter them, so "who cancelled
--    this?" and "what did the total used to be?" need answers. `detail` holds a
--    small JSON blob (changed fields, before/after totals); it is written for
--    humans reading history, never parsed back into the order.

ALTER TABLE order_items
  ADD COLUMN menu_item_id INT UNSIGNED NULL AFTER order_id,
  ADD COLUMN variant_id   INT UNSIGNED NULL AFTER menu_item_id,
  ADD COLUMN addon_ids    VARCHAR(255) NULL AFTER variant_id;

CREATE TABLE order_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  -- 'admin' | 'customer' | 'system'
  actor_type  VARCHAR(16)  NOT NULL,
  -- admin_users.id or customers.id; NULL for system
  actor_id    INT UNSIGNED NULL,
  -- username / customer name at the time, so history survives a deleted account
  actor_label VARCHAR(120) NOT NULL DEFAULT '',
  -- 'created' | 'edited' | 'status' | 'cancelled'
  action      VARCHAR(24)  NOT NULL,
  detail      TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_events_order (order_id, id),
  CONSTRAINT fk_events_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

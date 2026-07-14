-- =====================================================================
-- Migration 001: branches dimension (multi-branch readiness)
-- Adds a `branches` table and a nullable `branch_id` on menu_items + orders.
-- Admin is untouched: items/orders it creates get branch_id NULL, which the
-- storefront treats as the default/shared branch. Existing rows are backfilled
-- to the default branch (id=1). Future multi-branch is additive (no migration).
-- =====================================================================

CREATE TABLE IF NOT EXISTS branches (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(15)  NULL,
  whatsapp   VARCHAR(15)  NULL,
  email      VARCHAR(190) NULL,
  address    TEXT NULL,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the default branch (id=1) from the current kitchen identity in config.
INSERT INTO branches (id, name, phone, whatsapp, email, sort_order)
VALUES (1, 'Vaatsalya Kitchens', '919623836382', '919623836382', 'msalil2810@gmail.com', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE menu_items ADD COLUMN branch_id INT UNSIGNED NULL;
ALTER TABLE orders     ADD COLUMN branch_id INT UNSIGNED NULL;

UPDATE menu_items SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE orders     SET branch_id = 1 WHERE branch_id IS NULL;

ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_branch
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE orders ADD CONSTRAINT fk_orders_branch
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX idx_menu_items_branch ON menu_items (branch_id);
CREATE INDEX idx_orders_branch     ON orders (branch_id);
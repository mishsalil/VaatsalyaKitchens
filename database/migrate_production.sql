-- migrate_production.sql
-- EVERY migration (001-012) in one file. SAFE TO RUN MORE THAN ONCE.
--
-- ============================================================================
-- WHAT THIS IS FOR
-- ============================================================================
-- The numbered migration_0NN_*.sql files remain the history — one file per
-- change, in order, so a diff shows when and why the schema moved. This file is
-- the DEPLOY artifact: the single thing to run against production.
--
-- Both exist on purpose. The numbered files are readable; this one is runnable
-- against a database in any state.
--
-- ============================================================================
-- WHEN YOU ADD A NEW MIGRATION
-- ============================================================================
-- Append it to the bottom of this file too, in guarded form (copy the pattern
-- of any block below). This file must always be the sum of the numbered ones.
--
-- To prove it still is, build a scratch database two ways and compare:
--   A) schema.sql, then every migration_0NN file in order
--   B) schema.sql, then this file
-- The two schemas must be identical. That check is what stops the two from
-- silently drifting apart.
--
-- ============================================================================
-- WHY EVERY STATEMENT IS WRAPPED
-- ============================================================================
-- MySQL has no "ADD COLUMN IF NOT EXISTS", and this project has no migrations
-- table recording what already ran. A plain ALTER aborts with "Duplicate column
-- name" the second time, and a run that dies half way leaves you guessing which
-- half applied. Every statement here asks information_schema first and skips
-- what already exists.
--
-- Inline PREPARE rather than a stored procedure, so no DELIMITER handling is
-- needed and it behaves the same in phpMyAdmin, Adminer and the mysql client.
-- Portable across MySQL 5.7+ and MariaDB.
--
-- The INSERT/UPDATE statements are left exactly as the numbered files wrote
-- them: they are already idempotent (INSERT IGNORE, ON DUPLICATE KEY UPDATE,
-- and UPDATE ... WHERE col IS NULL, which matches nothing on a second run).
--
-- ============================================================================
-- RUNNING IT
-- ============================================================================
--   mysqldump -u USER -p DATABASE > backup-before-migrate.sql     <- do this first
--   mysql -u USER -p DATABASE < migrate_production.sql
--
-- Or paste into phpMyAdmin's SQL tab. Every row of the table it prints at the
-- end must read OK.
--
-- MIGRATE BEFORE DEPLOYING THE CODE. Old code ignores columns it does not know
-- about, so migrating first is harmless; deploying first is not.
-- ============================================================================


-- ============================================================================
-- 001 — branches
-- ============================================================================
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

INSERT INTO branches (id, name, phone, whatsapp, email, sort_order)
VALUES (1, 'Vaatsalya Kitchens', '919623836382', '919623836382', 'msalil2810@gmail.com', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE menu_items ADD COLUMN branch_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND COLUMN_NAME='branch_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN branch_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='branch_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Backfill. Matches nothing once the columns are populated.
UPDATE menu_items SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE orders     SET branch_id = 1 WHERE branch_id IS NULL;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL')
  FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND CONSTRAINT_NAME='fk_menu_items_branch');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL')
  FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND CONSTRAINT_NAME='fk_orders_branch');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'CREATE INDEX idx_menu_items_branch ON menu_items (branch_id)')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND INDEX_NAME='idx_menu_items_branch');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'CREATE INDEX idx_orders_branch ON orders (branch_id)')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='idx_orders_branch');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ============================================================================
-- 002 — editable settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
  `key`       VARCHAR(190) NOT NULL PRIMARY KEY,
  `value`     TEXT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('kitchen_name',    'Vaatsalya Kitchens'),
  ('kitchen_address', ''),
  ('gstin',           ''),
  ('print_footer',    'Thank you for ordering with Vaatsalya Kitchens!'),
  ('logo_path',       NULL);


-- ============================================================================
-- 003 — admin roles
-- ============================================================================
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE admin_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT ''staff'' AFTER username')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='admin_users' AND COLUMN_NAME='role');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE admin_users SET role = 'super' WHERE username = 'admin';


-- ============================================================================
-- 004 — tax-exclusive GST snapshot
-- ============================================================================
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='subtotal');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cgst DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cgst');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN sgst DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='sgst');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_rate');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

INSERT IGNORE INTO settings (`key`, `value`) VALUES ('gst_rate', '5');


-- ============================================================================
-- 005 — subcategories, variants, add-ons
-- ============================================================================
CREATE TABLE IF NOT EXISTS menu_subcategories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_subcat_category (category_id),
  CONSTRAINT fk_subcat_category FOREIGN KEY (category_id)
    REFERENCES menu_categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE menu_items ADD COLUMN subcategory_id INT UNSIGNED NULL AFTER category_id')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND COLUMN_NAME='subcategory_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE menu_items ADD KEY idx_menu_items_subcat (subcategory_id)')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND INDEX_NAME='idx_menu_items_subcat');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_subcat FOREIGN KEY (subcategory_id) REFERENCES menu_subcategories (id) ON DELETE SET NULL')
  FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_items' AND CONSTRAINT_NAME='fk_menu_items_subcat');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_variants_item (item_id),
  CONSTRAINT fk_variants_item FOREIGN KEY (item_id)
    REFERENCES menu_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS menu_item_addons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  available TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_addons_item (item_id),
  CONSTRAINT fk_addons_item FOREIGN KEY (item_id)
    REFERENCES menu_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN variant_name VARCHAR(80) NULL AFTER item_name')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN addons_text VARCHAR(255) NULL AFTER variant_name')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='addons_text');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ============================================================================
-- 006 — counter billing: discount, delivery charge, complimentary
--       GST is charged on (subtotal - discount); delivery is added after tax.
-- ============================================================================
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_pct');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='delivery_charge');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN is_complimentary TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='is_complimentary');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ============================================================================
-- 007 — menu ids behind each order line, and the audit trail
-- ============================================================================
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN menu_item_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='menu_item_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN variant_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN addon_ids VARCHAR(255) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='addon_ids');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS order_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  actor_type  VARCHAR(16)  NOT NULL,
  actor_id    INT UNSIGNED NULL,
  actor_label VARCHAR(120) NOT NULL DEFAULT '',
  action      VARCHAR(24)  NOT NULL,
  detail      TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_events_order (order_id, id),
  CONSTRAINT fk_events_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================================
-- 008 — staff push devices, and the kitchen-was-told confirmation
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
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

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_acked_at DATETIME NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_acked_by INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_acked_label VARCHAR(120) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_label');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ============================================================================
-- 009 — a customer cancelling records a REQUEST; confirming is what cancels it
-- ============================================================================
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_requested_at DATETIME NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_requested_by INT UNSIGNED NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN cancel_requested_label VARCHAR(120) NULL')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_label');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ============================================================================
-- 010 — opening hours (kitchen + per-category), and orders.needed_at
--       Windows are rows so a day can hold a lunch and a dinner service.
--       weekday is 0=Sunday, matching PHP date('w') and JS getDay().
-- ============================================================================
CREATE TABLE IF NOT EXISTS kitchen_hours (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  weekday   TINYINT UNSIGNED NOT NULL,
  opens_at  TIME NOT NULL,
  closes_at TIME NOT NULL,
  KEY idx_kitchen_hours_day (weekday, opens_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS category_hours (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  weekday     TINYINT UNSIGNED NOT NULL,
  opens_at    TIME NOT NULL,
  closes_at   TIME NOT NULL,
  KEY idx_category_hours (category_id, weekday),
  CONSTRAINT fk_category_hours_category FOREIGN KEY (category_id)
    REFERENCES menu_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN needed_at DATETIME NULL AFTER needed_on')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='needed_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Seed the hours the site already advertised (8:00 AM to midnight, all days),
-- so this changes nothing until someone edits them in Settings. Only seeded
-- when the table is empty, so an edited schedule is never overwritten.
INSERT INTO kitchen_hours (weekday, opens_at, closes_at)
SELECT d, '08:00:00', '23:59:59'
  FROM (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) days
 WHERE NOT EXISTS (SELECT 1 FROM kitchen_hours);


-- ============================================================================
-- 011 — bearer tokens for API authentication
--       Native (Capacitor) serves the SPA from https://localhost, so the
--       SameSite=Lax session cookie is never sent. A header-borne token works
--       for web and native alike. Selector/validator, same as customer_tokens.
--       No FK: subject_type is polymorphic (customer or admin). Verification
--       resolves the subject on every request and fails closed if it is gone.
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_tokens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_type   ENUM('customer','admin') NOT NULL,
  subject_id     INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,
  device_label   VARCHAR(80) NULL,
  expires_at     DATETIME NOT NULL,
  last_used_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_selector (selector),
  KEY idx_auth_tokens_subject (subject_type, subject_id),
  KEY idx_auth_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================================
-- 012 — FCM registration tokens for the Android app
--       Web Push tables are shaped for an endpoint + encryption keys; an FCM
--       token is one opaque string, so it gets its own table rather than
--       making those columns nullable for everyone.
--       Two nullable owners: a device may be a guest, a customer, an admin, or
--       both — and real FKs are kept, SET NULL for customer, CASCADE for admin.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token        VARCHAR(255) NOT NULL,
  customer_id  INT UNSIGNED NULL,
  admin_id     INT UNSIGNED NULL,
  device_label VARCHAR(80) NULL,
  last_seen_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fcm_token (token(191)),
  KEY idx_fcm_customer (customer_id),
  KEY idx_fcm_admin (admin_id),
  CONSTRAINT fk_fcm_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_fcm_admin FOREIGN KEY (admin_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================================
-- VERIFICATION — every row must read OK.
-- ============================================================================
SELECT 'orders.branch_id' AS item, IF(COUNT(*) = 1, 'OK', 'MISSING') AS status FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='branch_id'
UNION ALL SELECT 'menu_items.branch_id',            IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_items'  AND COLUMN_NAME='branch_id'
UNION ALL SELECT 'admin_users.role',                IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_users' AND COLUMN_NAME='role'
UNION ALL SELECT 'orders.subtotal',                 IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='subtotal'
UNION ALL SELECT 'orders.gst_rate',                 IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_rate'
UNION ALL SELECT 'menu_items.subcategory_id',       IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_items' AND COLUMN_NAME='subcategory_id'
UNION ALL SELECT 'order_items.variant_name',        IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_name'
UNION ALL SELECT 'orders.discount_pct',             IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_pct'
UNION ALL SELECT 'orders.discount_amount',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_amount'
UNION ALL SELECT 'orders.delivery_charge',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='delivery_charge'
UNION ALL SELECT 'orders.is_complimentary',         IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='is_complimentary'
UNION ALL SELECT 'order_items.menu_item_id',        IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='menu_item_id'
UNION ALL SELECT 'order_items.variant_id',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_id'
UNION ALL SELECT 'order_items.addon_ids',           IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='addon_ids'
UNION ALL SELECT 'orders.cancel_acked_at',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_at'
UNION ALL SELECT 'orders.cancel_acked_by',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_by'
UNION ALL SELECT 'orders.cancel_acked_label',       IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_acked_label'
UNION ALL SELECT 'orders.cancel_requested_at',      IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_at'
UNION ALL SELECT 'orders.cancel_requested_by',      IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_by'
UNION ALL SELECT 'orders.cancel_requested_label',   IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cancel_requested_label'
UNION ALL SELECT 'orders.needed_at',                IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='needed_at'
UNION ALL SELECT 'table branches',                  IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='branches'
UNION ALL SELECT 'table settings',                  IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settings'
UNION ALL SELECT 'table menu_subcategories',        IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_subcategories'
UNION ALL SELECT 'table menu_item_variants',        IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_item_variants'
UNION ALL SELECT 'table menu_item_addons',          IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_item_addons'
UNION ALL SELECT 'table order_events',              IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_events'
UNION ALL SELECT 'table admin_push_subscriptions',  IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_push_subscriptions'
UNION ALL SELECT 'table kitchen_hours',             IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='kitchen_hours'
UNION ALL SELECT 'table category_hours',            IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='category_hours'
UNION ALL SELECT 'table auth_tokens',               IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_tokens'
UNION ALL SELECT 'table fcm_tokens',                IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fcm_tokens'
UNION ALL SELECT 'kitchen_hours seeded',            IF(COUNT(*) >= 1,'OK','EMPTY') FROM kitchen_hours;

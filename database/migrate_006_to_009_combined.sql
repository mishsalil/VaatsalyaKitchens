-- migrate_006_to_009_combined.sql
--
-- Migrations 006, 007, 008 and 009 in one file, SAFE TO RUN MORE THAN ONCE.
--
-- The individual migration files use plain ALTER TABLE ... ADD COLUMN, which
-- aborts with "Duplicate column name" the second time it sees a column. This
-- project has no migrations table, so nothing records what has already run —
-- and a run that dies half way leaves you guessing which half applied. Every
-- statement here checks information_schema first and skips what already exists,
-- so you can run it, lose the connection, and just run it again.
--
-- Written with inline PREPARE rather than a stored procedure so it needs no
-- DELIMITER handling and works the same in phpMyAdmin, Adminer, and the mysql
-- client. Portable across MySQL 5.7+ and MariaDB.
--
-- RUN THIS BEFORE DEPLOYING THE NEW CODE. The old code ignores columns it does
-- not know about, so migrating first is harmless; deploying first is not — the
-- new code errors on every order read and write until these exist.
--
--   mysql -u USER -p DATABASE < migrate_006_to_009_combined.sql
--
-- Take a backup first:
--   mysqldump -u USER -p DATABASE > backup-before-006-009.sql

-- ---------------------------------------------------------------------------
-- 006 — counter billing: discount, delivery charge, complimentary orders.
--       GST is charged on (subtotal - discount); delivery is added after tax.
-- ---------------------------------------------------------------------------
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'discount_pct');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'discount_amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_charge');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN is_complimentary TINYINT(1) NOT NULL DEFAULT 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'is_complimentary');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 007 — the menu ids behind each order line (so an edit rebuilds a line
--       exactly instead of matching on name), plus the audit trail.
-- ---------------------------------------------------------------------------
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE order_items ADD COLUMN menu_item_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'menu_item_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE order_items ADD COLUMN variant_id INT UNSIGNED NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'variant_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE order_items ADD COLUMN addon_ids VARCHAR(255) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'addon_ids');
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

-- ---------------------------------------------------------------------------
-- 008 — staff push devices, and the human confirmation that the kitchen was
--       told about a cancellation.
-- ---------------------------------------------------------------------------
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

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_acked_at DATETIME NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_acked_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_acked_by INT UNSIGNED NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_acked_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_acked_label VARCHAR(120) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_acked_label');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 009 — a customer cancelling records a REQUEST; the order keeps its real
--       status until a rep confirms, and confirming is what cancels it.
-- ---------------------------------------------------------------------------
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_requested_at DATETIME NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_requested_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_requested_by INT UNSIGNED NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_requested_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE orders ADD COLUMN cancel_requested_label VARCHAR(120) NULL')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancel_requested_label');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Verification — every row must read OK.
-- ---------------------------------------------------------------------------
SELECT 'orders.discount_pct'            AS item, IF(COUNT(*) = 1, 'OK', 'MISSING') AS status FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='discount_pct'
UNION ALL SELECT 'orders.discount_amount',        IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='discount_amount'
UNION ALL SELECT 'orders.delivery_charge',        IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='delivery_charge'
UNION ALL SELECT 'orders.is_complimentary',       IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='is_complimentary'
UNION ALL SELECT 'order_items.menu_item_id',      IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='menu_item_id'
UNION ALL SELECT 'order_items.variant_id',        IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_id'
UNION ALL SELECT 'order_items.addon_ids',         IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='addon_ids'
UNION ALL SELECT 'orders.cancel_acked_at',        IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_acked_at'
UNION ALL SELECT 'orders.cancel_acked_by',        IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_acked_by'
UNION ALL SELECT 'orders.cancel_acked_label',     IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_acked_label'
UNION ALL SELECT 'orders.cancel_requested_at',    IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_requested_at'
UNION ALL SELECT 'orders.cancel_requested_by',    IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_requested_by'
UNION ALL SELECT 'orders.cancel_requested_label', IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'      AND COLUMN_NAME='cancel_requested_label'
UNION ALL SELECT 'table order_events',            IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_events'
UNION ALL SELECT 'table admin_push_subscriptions',IF(COUNT(*) = 1,'OK','MISSING') FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_push_subscriptions';

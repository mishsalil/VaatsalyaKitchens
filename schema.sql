-- =====================================================================
-- Vaatsalya Kitchens — database schema + starting data
-- Import this ONCE into your MySQL database (cPanel → phpMyAdmin → Import).
-- Safe to re-run only on an empty database: it drops existing tables.
-- =====================================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS customer_tokens;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS menu_categories;
DROP TABLE IF EXISTS admin_users;

-- ---------- Customers ----------
CREATE TABLE customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(15)  NOT NULL,           -- digits only, e.g. 919876543210
  email         VARCHAR(190) NULL,
  pin_hash      VARCHAR(255) NULL,               -- NULL until customer sets a PIN
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_order_at DATETIME NULL,
  UNIQUE KEY uq_customers_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Remember-me tokens (selector:validator pattern; validator stored hashed)
CREATE TABLE customer_tokens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,              -- sha256 hex
  expires_at     DATETIME NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tokens_selector (selector),
  KEY idx_tokens_customer (customer_id),
  CONSTRAINT fk_tokens_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Addresses (a customer can save several) ----------
CREATE TABLE addresses (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT UNSIGNED NOT NULL,
  label        VARCHAR(40)  NOT NULL DEFAULT 'Home',
  address_text TEXT         NOT NULL,
  lat          DECIMAL(10,7) NULL,
  lng          DECIMAL(10,7) NULL,
  is_default   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_addresses_customer (customer_id),
  CONSTRAINT fk_addresses_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Orders ----------
CREATE TABLE orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT UNSIGNED NULL,               -- kept even if customer later deleted
  name           VARCHAR(120) NOT NULL,           -- snapshot of who ordered
  phone          VARCHAR(15)  NOT NULL,
  occasion       VARCHAR(60)  NULL,
  needed_on      VARCHAR(160) NOT NULL,           -- free text: "Saturday 20 July, 1 PM"
  address_text   TEXT NULL,                       -- NULL / empty = pickup
  lat            DECIMAL(10,7) NULL,
  lng            DECIMAL(10,7) NULL,
  notes          TEXT NULL,
  total_estimate DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         ENUM('new','confirmed','preparing','out_for_delivery','delivered','cancelled')
                 NOT NULL DEFAULT 'new',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_status_created (status, created_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Item snapshot per order (menu edits never change past orders)
CREATE TABLE order_items (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id  INT UNSIGNED NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  unit      VARCHAR(60)  NOT NULL DEFAULT '',
  price     DECIMAL(10,2) NOT NULL,
  qty       INT UNSIGNED NOT NULL,
  KEY idx_items_order (order_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Menu ----------
CREATE TABLE menu_categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE menu_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name        VARCHAR(160) NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  unit        VARCHAR(60) NOT NULL DEFAULT '',
  available   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0,
  KEY idx_menu_items_category (category_id),
  CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id)
    REFERENCES menu_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Push subscriptions ----------
CREATE TABLE push_subscriptions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  endpoint    VARCHAR(500) NOT NULL,
  p256dh      VARCHAR(255) NOT NULL,
  auth_key    VARCHAR(255) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint(191)),
  KEY idx_push_customer (customer_id),
  CONSTRAINT fk_push_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Admin ----------
CREATE TABLE admin_users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Login rate limiting ----------
CREATE TABLE login_attempts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identifier   VARCHAR(190) NOT NULL,             -- phone or admin username or ip
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts (identifier, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Starting data
-- =====================================================================

-- Default admin login: username "admin", password "ChangeMe@123"
-- >>> CHANGE THIS PASSWORD from Admin Panel → (or ask your developer) <<<
INSERT INTO admin_users (username, password_hash) VALUES
('admin', '$2y$12$FjMZGgtVYr/6wd6JZrKZcuiCqYjvKOl.GR5vyUnS8/AOgA6/22FcC');

INSERT INTO menu_categories (id, name, sort_order) VALUES
(1, 'Party Snacks & Starters', 1),
(2, 'Kitty Party Specials', 2),
(3, 'Main Course (Bulk Friendly)', 3),
(4, 'Desserts', 4);

INSERT INTO menu_items (category_id, name, price, unit, sort_order) VALUES
(1, 'Paneer Tikka',                          250, 'per plate (8 pcs)', 1),
(1, 'Hara Bhara Kabab',                      180, 'per plate (8 pcs)', 2),
(1, 'Dahi Ke Sholey',                        200, 'per plate (8 pcs)', 3),
(1, 'Assorted Pakoda Platter',               220, 'per platter',       4),
(2, 'Chaat Counter (Golgappa + Papdi Chaat)',150, 'per person',        1),
(2, 'Sandwich & Wraps Platter',              350, 'per platter (10 pcs)', 2),
(2, 'Dhokla & Khandvi Platter',              280, 'per platter',       3),
(2, 'Tea / Coffee Kettle',                   300, 'serves 10',         4),
(3, 'Shahi Paneer',                          320, 'per kg',            1),
(3, 'Dal Makhani',                           260, 'per kg',            2),
(3, 'Mix Veg',                               240, 'per kg',            3),
(3, 'Chole',                                 240, 'per kg',            4),
(3, 'Jeera Rice',                            180, 'per kg',            5),
(3, 'Veg Biryani',                           280, 'per kg',            6),
(3, 'Tawa Roti',                               8, 'per piece',         7),
(3, 'Butter Naan',                            25, 'per piece',         8),
(4, 'Gulab Jamun',                           200, 'per 10 pcs',        1),
(4, 'Moong Dal Halwa',                       350, 'per kg',            2),
(4, 'Kheer',                                 250, 'per kg',            3);

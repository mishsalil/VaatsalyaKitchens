-- migration_005_menu_options.sql
-- Subcategories, per-item variants (base price + delta), per-item add-ons,
-- and order-item snapshots of the chosen variant/add-ons.
-- Tax-exclusive GST math (includes/gst.php) is unchanged; the charged line
-- unit price (base + variant delta + sum of add-ons) is snapshotted on
-- order_items.price, with variant_name / addons_text for the receipt.

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

ALTER TABLE menu_items
  ADD COLUMN subcategory_id INT UNSIGNED NULL AFTER category_id,
  ADD KEY idx_menu_items_subcat (subcategory_id),
  ADD CONSTRAINT fk_menu_items_subcat FOREIGN KEY (subcategory_id)
    REFERENCES menu_subcategories (id) ON DELETE SET NULL;

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

ALTER TABLE order_items
  ADD COLUMN variant_name VARCHAR(80) NULL AFTER item_name,
  ADD COLUMN addons_text VARCHAR(255) NULL AFTER variant_name;
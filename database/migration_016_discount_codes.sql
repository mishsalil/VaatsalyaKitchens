-- migration_016_discount_codes.sql — discount codes (customer side).
--
-- The admin sets one number (discount_budget_pct); includes/discounts.php
-- derives three codes from it. Codes are never deleted (orders name them by
-- text) — regeneration deactivates the old rows. On an order, discount_pct /
-- discount_amount stay the TOTAL discount; code_pct / code_amount say how much
-- of it the code contributed (the rest is the counter's manual %).

CREATE TABLE IF NOT EXISTS discount_codes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(20)  NOT NULL,
  kind             ENUM('first','flat','big') NOT NULL,
  pct              DECIMAL(5,2) NOT NULL,
  max_amount       DECIMAL(10,2) NOT NULL,
  min_order        DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1)   NOT NULL DEFAULT 0,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discount_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE orders ADD COLUMN discount_code VARCHAR(20) NULL AFTER discount_pct;
ALTER TABLE orders ADD COLUMN code_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER discount_code;
ALTER TABLE orders ADD COLUMN code_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER code_pct;

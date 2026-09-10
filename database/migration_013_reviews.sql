-- migration_013_reviews.sql — ratings and reviews, phase 1.
--
-- Captures one rating per order plus optional per-dish stars, and the state
-- needed to prompt for it exactly once. Review text is INTERNAL: nothing here
-- is rendered on the public storefront.

ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL AFTER status;

CREATE TABLE IF NOT EXISTS order_reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  stars       TINYINT UNSIGNED NOT NULL,
  comment     TEXT NULL,
  source      ENUM('link','account') NOT NULL DEFAULT 'link',
  acked_at    DATETIME NULL,
  acked_by    INT UNSIGNED NULL,
  acked_label VARCHAR(120) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_order (order_id),
  KEY idx_review_stars_created (stars, created_at),
  CONSTRAINT fk_review_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No FK to order_items or menu_items on purpose: a menu item can be deleted,
-- and a rating of a dish we no longer sell is still a fact about a meal we
-- served. The write path validates that order_item_id belongs to the order.
CREATE TABLE IF NOT EXISTS order_item_reviews (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id     INT UNSIGNED NOT NULL,
  order_item_id INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NULL,
  stars         TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_item_review (review_id, order_item_id),
  KEY idx_item_review_menu (menu_item_id),
  CONSTRAINT fk_item_review_review FOREIGN KEY (review_id)
    REFERENCES order_reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_prompts (
  order_id    INT UNSIGNED PRIMARY KEY,
  due_at      DATETIME NOT NULL,
  sent_at     DATETIME NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_prompt_due (sent_at, due_at),
  CONSTRAINT fk_prompt_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Many tokens per order. The plaintext validator exists only at creation, so a
-- single stored token would force rotation on "copy link", killing a link push
-- already delivered. Every issuance appends; submitting burns them all.
CREATE TABLE IF NOT EXISTS review_tokens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,
  expires_at     DATETIME NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_token_selector (selector),
  KEY idx_review_token_order (order_id),
  CONSTRAINT fk_review_token_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The cutover. The sweep ignores orders created before this moment, so
-- switching the cron on does not message every customer in the database about
-- a meal from months ago.
INSERT INTO settings (`key`, `value`)
VALUES ('reviews_since', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
ON DUPLICATE KEY UPDATE `key` = `key`;

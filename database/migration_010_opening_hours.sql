-- migration_010_opening_hours.sql
-- Opening hours for the kitchen, and per-category availability windows.
--
-- WHY TWO TABLES AND NOT COLUMNS
-- A kitchen runs split shifts — lunch 11:00-15:00, dinner 18:00-23:00 — so a
-- single opens/closes pair per weekday cannot express the real schedule. Rows,
-- not columns, so any number of windows can sit on a day and a day with no rows
-- is simply closed.
--
-- WEEKDAY NUMBERING is 0=Sunday .. 6=Saturday, which is what both PHP's
-- date('w') and JavaScript's getDay() return — no translation layer, and no
-- off-by-one waiting to happen between the two halves of the app.
--
-- WINDOWS MAY CROSS MIDNIGHT. When closes_at <= opens_at the window runs into
-- the next day (22:00-02:00 is a real dinner service). The checker in
-- includes/hours.php handles that; the data just records the two times.
--
-- CATEGORY WINDOWS ARE AN OVERRIDE, NOT A REQUIREMENT. A category with no rows
-- is available whenever the kitchen itself is open — so existing categories keep
-- working untouched, and only something like Tandoor needs configuring.
-- A category window is always intersected with the kitchen's hours: a category
-- can never be orderable while the kitchen is shut.
--
-- orders.needed_at IS THE REAL DATETIME. needed_on is free text ("Sat 20 Jul,
-- 1:00 PM") and always has been, which is fine for a printed slip but cannot be
-- validated against a schedule. The text column stays for display and for every
-- existing order; needed_at is what the server checks. NULL on old orders.
--
-- The seed reproduces the hours the site already advertises (08:00 to midnight,
-- every day), so deploying this changes nothing until someone edits them.

CREATE TABLE kitchen_hours (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  weekday   TINYINT UNSIGNED NOT NULL,
  opens_at  TIME NOT NULL,
  closes_at TIME NOT NULL,
  KEY idx_kitchen_hours_day (weekday, opens_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE category_hours (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  weekday     TINYINT UNSIGNED NOT NULL,
  opens_at    TIME NOT NULL,
  closes_at   TIME NOT NULL,
  KEY idx_category_hours (category_id, weekday),
  CONSTRAINT fk_category_hours_category FOREIGN KEY (category_id)
    REFERENCES menu_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE orders
  ADD COLUMN needed_at DATETIME NULL AFTER needed_on;

-- Current advertised hours: 8:00 AM to midnight, all seven days.
INSERT INTO kitchen_hours (weekday, opens_at, closes_at) VALUES
  (0, '08:00:00', '23:59:59'),
  (1, '08:00:00', '23:59:59'),
  (2, '08:00:00', '23:59:59'),
  (3, '08:00:00', '23:59:59'),
  (4, '08:00:00', '23:59:59'),
  (5, '08:00:00', '23:59:59'),
  (6, '08:00:00', '23:59:59');

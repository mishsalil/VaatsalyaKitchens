-- =====================================================================
-- Menu snapshot — replaces the destination's menu with this one, ids intact.
--
-- Generated 2026-09-08 21:02 by scripts/export-menu-sql.php. Do not hand-edit; change
-- the menu in the admin and export again.
--
-- WHAT IT REPLACES
--   menu_categories      11 rows
--   menu_subcategories   0 rows
--   menu_items           111 rows
--   menu_item_variants   1 rows
--   menu_item_addons     0 rows
--
-- IDS ARE PRESERVED ON PURPOSE. Dish photos are files named after the menu
-- item id, so ids that shifted would orphan every photo. AUTO_INCREMENT is
-- reset past the highest id, so items added afterwards cannot collide.
--
-- WHAT IT DESTROYS. Every menu row in the destination, including the starter
-- menu that install_fresh.sql seeds, and any per-category opening hours.
-- Orders are NOT touched: each order line stores its own name, price and
-- quantity, so past bills and receipts read exactly as before. The one thing
-- that changes is editing an OLD order in the admin — a line whose menu item
-- no longer exists can no longer be rebuilt from the menu, only from the
-- snapshot it already carries.
--
-- Run it once, on the destination database:
--   mysql -u USER -p DBNAME < database/menu_snapshot.sql
-- or paste it into phpMyAdmin with the database selected.
--
-- It runs as one transaction: if any statement fails, nothing changes.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

START TRANSACTION;

-- Out with the old, children first so no foreign key is left dangling.
DELETE FROM `category_hours`;
DELETE FROM `menu_item_addons`;
DELETE FROM `menu_item_variants`;
DELETE FROM `menu_items`;
DELETE FROM `menu_subcategories`;
DELETE FROM `menu_categories`;

INSERT INTO `menu_categories` (`id`, `name`, `sort_order`, `active`) VALUES
  (7, 'Starters', 5, 1),
  (8, 'Tandoori Starters', 6, 1),
  (9, 'Fried Rice and Noodles', 7, 1),
  (10, 'Snacks', 8, 1),
  (11, 'South Indian', 9, 1),
  (12, 'Main Course', 10, 1),
  (13, 'Tandoori Breads', 11, 1),
  (14, 'Tawa Breads', 12, 1),
  (15, 'Rice and Biryani', 13, 1),
  (16, 'Salads', 14, 1),
  (17, 'Easy Combos', 15, 1);
ALTER TABLE `menu_categories` AUTO_INCREMENT = 18;

-- menu_subcategories: no rows here, so the destination's are cleared and none added.

INSERT INTO `menu_items` (`id`, `category_id`, `subcategory_id`, `name`, `price`, `unit`, `available`, `sort_order`, `branch_id`) VALUES
  (22, 7, NULL, 'Hara Bhara Kebab [8 Pieces]', 199.00, '', 1, 9, 1),
  (23, 7, NULL, 'Crispy Chilli Corn', 149.00, '', 1, 10, 1),
  (24, 7, NULL, 'Veg Spring Roll', 249.00, '', 1, 11, 1),
  (25, 7, NULL, 'Chilli Potato', 199.00, '', 1, 12, 1),
  (26, 7, NULL, 'Honey Chilli Potato', 199.00, '', 1, 13, 1),
  (27, 7, NULL, 'Veg Manchurian Dry', 199.00, '', 1, 14, 1),
  (28, 7, NULL, 'Chilli Paneer Dry', 249.00, '', 1, 15, 1),
  (29, 7, NULL, 'Hot Garlic Paneer', 249.00, '', 1, 16, 1),
  (30, 7, NULL, 'Honey Chilli Paneer', 249.00, '', 1, 17, 1),
  (31, 8, NULL, 'Tandoori Aloo [8 Pieces]', 199.00, '', 1, 18, 1),
  (32, 8, NULL, 'Tandoori Gobhi [8 Pieces]', 199.00, '', 1, 19, 1),
  (33, 8, NULL, 'Tandoori Paneer Tikka [8 Pieces]', 299.00, '', 1, 20, 1),
  (34, 8, NULL, 'Achari Paneer Tikka [8 Pieces]', 299.00, '', 1, 21, 1),
  (35, 8, NULL, 'Malai Paneer Tikka [8 Pieces]', 299.00, '', 1, 22, 1),
  (36, 9, NULL, 'Veg Noodles', 199.00, '', 1, 23, 1),
  (37, 9, NULL, 'Chilli Garlic Noodles', 199.00, '', 1, 24, 1),
  (38, 9, NULL, 'Singapuri Noodles', 199.00, '', 1, 25, 1),
  (39, 9, NULL, 'Veg Fried Rice', 199.00, '', 1, 26, 1),
  (40, 9, NULL, 'Chilli Garlic Fried Rice', 199.00, '', 1, 27, 1),
  (41, 9, NULL, 'Burnt Garlic Fried Rice', 199.00, '', 1, 28, 1),
  (42, 10, NULL, 'Veg Grilled Sandwich', 129.00, '', 1, 29, 1),
  (43, 10, NULL, 'Corn Grilled Sandwich', 129.00, '', 1, 30, 1),
  (44, 10, NULL, 'Masala Aloo Grilled Sandwich', 129.00, '', 1, 31, 1),
  (45, 10, NULL, 'Cheese Chilli Grilled Sandwich', 149.00, '', 1, 32, 1),
  (46, 10, NULL, 'Hariyali Paneer Grilled Sandwich', 149.00, '', 1, 33, 1),
  (47, 10, NULL, 'Tandoori Paneer Grilled Sandwich', 149.00, '', 1, 34, 1),
  (48, 10, NULL, 'Achari Paneer Grilled Sandwich', 149.00, '', 1, 35, 1),
  (49, 10, NULL, 'Bombay Veg Special Sandwich', 149.00, '', 1, 36, 1),
  (50, 10, NULL, 'Teekha Aloo Wrap', 149.00, '', 1, 37, 1),
  (51, 10, NULL, 'Teekha Aloo Achari Wrap', 149.00, '', 1, 38, 1),
  (52, 10, NULL, 'Chilli Potato Wrap', 149.00, '', 1, 39, 1),
  (53, 10, NULL, 'Corn Masala Wrap', 199.00, '', 1, 40, 1),
  (54, 10, NULL, 'Peri Peri Paneer Tikka Wrap', 199.00, '', 1, 41, 1),
  (55, 10, NULL, 'Tandoori Paneer Tikka Wrap', 199.00, '', 1, 42, 1),
  (56, 10, NULL, 'Achari Paneer Tikka Wrap', 199.00, '', 1, 43, 1),
  (57, 10, NULL, 'Chilli Paneer Wrap', 199.00, '', 1, 44, 1),
  (58, 10, NULL, 'Fries', 99.00, '', 1, 45, 1),
  (59, 10, NULL, 'Crispy Corn (Fried Corn)', 149.00, '', 1, 46, 1),
  (60, 10, NULL, 'Steamed Corn', 99.00, '', 1, 47, 1),
  (61, 10, NULL, 'Pyaaz Pakora [8 Pieces]', 99.00, '', 1, 48, 1),
  (62, 10, NULL, 'Gobhi Pakora [8 Pieces]', 149.00, '', 1, 49, 1),
  (63, 10, NULL, 'Paneer Pakora [8 Pieces]', 199.00, '', 1, 50, 1),
  (64, 10, NULL, 'Dahi Ke Shole', 199.00, '', 1, 51, 1),
  (65, 11, NULL, 'Plain Dosa', 129.00, '', 1, 52, 1),
  (66, 11, NULL, 'Masala Dosa', 179.00, '', 1, 53, 1),
  (67, 11, NULL, 'Podi Dosa', 179.00, '', 1, 54, 1),
  (68, 11, NULL, 'Onion Dosa', 179.00, '', 1, 55, 1),
  (69, 11, NULL, 'Onion Masala Dosa', 179.00, '', 1, 56, 1),
  (70, 11, NULL, 'Mysore Masala Dosa', 179.00, '', 1, 57, 1),
  (71, 11, NULL, 'Paneer Masala Dosa', 179.00, '', 1, 58, 1),
  (72, 11, NULL, 'Schezwan Dosa', 179.00, '', 1, 59, 1),
  (73, 11, NULL, 'Corn Dosa', 179.00, '', 1, 60, 1),
  (74, 11, NULL, 'Plain Rava Dosa', 179.00, '', 1, 61, 1),
  (75, 11, NULL, 'Masala Rava Dosa', 179.00, '', 1, 62, 1),
  (76, 11, NULL, 'Plain Uttapam', 129.00, '', 1, 63, 1),
  (77, 11, NULL, 'Onion Uttapam', 179.00, '', 1, 64, 1),
  (78, 11, NULL, 'Tomato Uttapam', 179.00, '', 1, 65, 1),
  (79, 11, NULL, 'Mixed Veg Uttapam', 179.00, '', 1, 66, 1),
  (80, 11, NULL, 'Sambar', 79.00, '', 1, 67, 1),
  (81, 11, NULL, 'Coconut Chutney', 49.00, '', 1, 68, 1),
  (82, 11, NULL, 'Tomato Chutney', 49.00, '', 1, 69, 1),
  (83, 11, NULL, 'Green Chutney', 49.00, '', 1, 70, 1),
  (84, 11, NULL, 'Podi With Ghee', 69.00, '', 1, 71, 1),
  (85, 11, NULL, 'Medu Vada', 79.00, '', 1, 72, 1),
  (86, 12, NULL, 'Dal Fry', 199.00, '', 1, 73, 1),
  (87, 12, NULL, 'Dal Tadka', 199.00, '', 1, 74, 1),
  (88, 12, NULL, 'Dal Handi', 249.00, '', 1, 75, 1),
  (89, 12, NULL, 'Dal Makhani', 249.00, '', 1, 76, 1),
  (90, 12, NULL, 'Aloo Matar Dry', 199.00, '', 1, 77, 1),
  (91, 12, NULL, 'Aloo Matar Masala', 199.00, '', 1, 78, 1),
  (92, 12, NULL, 'Aloo Gobi Dry', 199.00, '', 1, 79, 1),
  (93, 12, NULL, 'Aloo Gobi Masala', 199.00, '', 1, 80, 1),
  (94, 12, NULL, 'Veg Kadhai', 199.00, '', 1, 81, 1),
  (95, 12, NULL, 'Mix Veg Dry', 199.00, '', 1, 82, 1),
  (96, 12, NULL, 'Paneer Noorani', 349.00, '', 1, 83, 1),
  (97, 12, NULL, 'Malai Kofta', 349.00, '', 1, 84, 1),
  (98, 12, NULL, 'Shahi Paneer', 299.00, '', 1, 85, 1),
  (99, 12, NULL, 'Paneer Do Pyaaza', 299.00, '', 1, 86, 1),
  (100, 12, NULL, 'Handi Paneer', 299.00, '', 1, 87, 1),
  (101, 12, NULL, 'Paneer Tikka Masala', 299.00, '', 1, 88, 1),
  (102, 12, NULL, 'Paneer Butter Masala', 299.00, '', 1, 89, 1),
  (103, 12, NULL, 'Matar Paneer', 299.00, '', 1, 90, 1),
  (104, 12, NULL, 'Kadhai Paneer', 299.00, '', 1, 91, 1),
  (105, 12, NULL, 'Veg Manchurian Gravy', 199.00, '', 1, 92, 1),
  (106, 12, NULL, 'Paneer Manchurian Gravy', 249.00, '', 1, 93, 1),
  (107, 12, NULL, 'Chilli Paneer Gravy', 249.00, '', 1, 94, 1),
  (108, 13, NULL, 'Tandoori Laccha Paratha', 79.00, '', 1, 95, 1),
  (109, 13, NULL, 'Naan', 69.00, '', 1, 96, 1),
  (110, 13, NULL, 'Tandoori Roti', 39.00, '', 1, 97, 1),
  (111, 13, NULL, 'Butter Tandoori Roti', 49.00, '', 1, 98, 1),
  (112, 13, NULL, 'Butter Naan', 79.00, '', 1, 99, 1),
  (113, 13, NULL, 'Garlic Naan', 79.00, '', 1, 100, 1),
  (114, 13, NULL, 'Butter Garlic Naan', 79.00, '', 1, 101, 1),
  (115, 14, NULL, 'Tawa Roti', 39.00, '', 1, 102, 1),
  (116, 14, NULL, 'Tawa Paratha', 39.00, '', 1, 103, 1),
  (117, 14, NULL, 'Tawa Laccha Paratha', 69.00, '', 1, 104, 1),
  (118, 14, NULL, 'Aloo Paratha', 99.00, '', 1, 105, 1),
  (119, 14, NULL, 'Pyaaz Paratha', 99.00, '', 1, 106, 1),
  (120, 14, NULL, 'Gobhi Paratha', 99.00, '', 1, 107, 1),
  (121, 14, NULL, 'Paneer Paratha', 149.00, '', 1, 108, 1),
  (122, 15, NULL, 'Steamed Rice', 149.00, '', 1, 109, 1),
  (123, 15, NULL, 'Jeera Rice', 199.00, '', 1, 110, 1),
  (124, 15, NULL, 'Veg Pulao', 199.00, '', 1, 111, 1),
  (125, 15, NULL, 'Matar Pulao', 199.00, '', 1, 112, 1),
  (126, 15, NULL, 'Kashmiri Pulao', 199.00, '', 1, 113, 1),
  (127, 15, NULL, 'Veg Tawa Biryani', 199.00, '', 1, 114, 1),
  (128, 16, NULL, 'Green Salad', 109.00, '', 1, 115, 1),
  (129, 17, NULL, 'Veg Standard Thali', 199.00, '', 1, 116, 1),
  (130, 17, NULL, 'Deluxe Paneer Thali', 249.00, '', 1, 117, 1),
  (131, 17, NULL, 'Chinese Combo Meal', 199.00, '', 1, 118, 1),
  (132, 17, NULL, 'Deluxe Chinese Combo', 249.00, '', 1, 119, 1);
ALTER TABLE `menu_items` AUTO_INCREMENT = 133;

INSERT INTO `menu_item_variants` (`id`, `item_id`, `name`, `price_delta`, `is_default`, `sort_order`) VALUES
  (9, 22, 1, 20.00, 1, 0);
ALTER TABLE `menu_item_variants` AUTO_INCREMENT = 10;

-- menu_item_addons: no rows here, so the destination's are cleared and none added.

COMMIT;

-- Read these back. Each count must match the header above.
SELECT 'menu_categories'    AS table_name, COUNT(*) AS rows_now FROM menu_categories
UNION ALL SELECT 'menu_subcategories', COUNT(*) FROM menu_subcategories
UNION ALL SELECT 'menu_items',         COUNT(*) FROM menu_items
UNION ALL SELECT 'menu_item_variants', COUNT(*) FROM menu_item_variants
UNION ALL SELECT 'menu_item_addons',   COUNT(*) FROM menu_item_addons;

-- The id range the dish photos are named after. If these do not match the
-- filenames in /menu, the photos will not appear.
SELECT MIN(id) AS lowest_item_id, MAX(id) AS highest_item_id FROM menu_items;

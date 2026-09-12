-- menu_options.sql — sizes/cooking options and add-ons, from the kitchen's Zomato listing.
-- Policy B: the site's own base price is kept; Zomato's upcharges are applied RELATIVE
-- to its cheapest option (Normal/Plain is +0 and the default). Add-on groups in the
-- export carry no dish mapping, so those are the kitchen's guess (see the README note).
-- Full replace per dish, matched by name. Safe to re-run.

-- Fries
SET @item := (SELECT id FROM menu_items WHERE name = 'Fries' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Plain', 0.00, 1, 0),
  (@item, 'Desi Masala', 30.00, 0, 1),
  (@item, 'Peri Peri', 30.00, 0, 2),
  (@item, 'Chilli Cheese', 50.00, 0, 3),
  (@item, 'Loaded Cheese', 50.00, 0, 4),
  (@item, 'Loaded Corn and Cheese', 50.00, 0, 5);

-- Crispy Corn (Fried Corn)
SET @item := (SELECT id FROM menu_items WHERE name = 'Crispy Corn (Fried Corn)' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Salted', 0.00, 1, 0),
  (@item, 'Pepper', 0.00, 0, 1),
  (@item, 'Chaat Masala', 0.00, 0, 2);

-- Steamed Corn
SET @item := (SELECT id FROM menu_items WHERE name = 'Steamed Corn' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 30.00, 0, 1),
  (@item, 'Cheese', 50.00, 0, 2);

-- Plain Uttapam
SET @item := (SELECT id FROM menu_items WHERE name = 'Plain Uttapam' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Onion Uttapam
SET @item := (SELECT id FROM menu_items WHERE name = 'Onion Uttapam' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Tomato Uttapam
SET @item := (SELECT id FROM menu_items WHERE name = 'Tomato Uttapam' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Mixed Veg Uttapam
SET @item := (SELECT id FROM menu_items WHERE name = 'Mixed Veg Uttapam' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Medu Vada
SET @item := (SELECT id FROM menu_items WHERE name = 'Medu Vada' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Sambhar Dipped', 0.00, 1, 0),
  (@item, 'Separate Sambhar', 0.00, 0, 1);

-- Plain Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Plain Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Masala Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Masala Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Podi Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Podi Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Onion Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Onion Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Onion Masala Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Onion Masala Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Mysore Masala Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Mysore Masala Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Paneer Masala Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Paneer Masala Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Schezwan Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Schezwan Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Corn Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Corn Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Plain Rava Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Plain Rava Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Masala Rava Dosa
SET @item := (SELECT id FROM menu_items WHERE name = 'Masala Rava Dosa' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Cheese', 30.00, 0, 3);

-- Paneer Noorani
SET @item := (SELECT id FROM menu_items WHERE name = 'Paneer Noorani' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Paneer Butter Masala
SET @item := (SELECT id FROM menu_items WHERE name = 'Paneer Butter Masala' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Malai Kofta
SET @item := (SELECT id FROM menu_items WHERE name = 'Malai Kofta' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Paneer Tikka Masala
SET @item := (SELECT id FROM menu_items WHERE name = 'Paneer Tikka Masala' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Kadhai Paneer
SET @item := (SELECT id FROM menu_items WHERE name = 'Kadhai Paneer' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Matar Paneer
SET @item := (SELECT id FROM menu_items WHERE name = 'Matar Paneer' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Paneer Do Pyaaza
SET @item := (SELECT id FROM menu_items WHERE name = 'Paneer Do Pyaaza' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Shahi Paneer
SET @item := (SELECT id FROM menu_items WHERE name = 'Shahi Paneer' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Handi Paneer
SET @item := (SELECT id FROM menu_items WHERE name = 'Handi Paneer' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Dal Fry
SET @item := (SELECT id FROM menu_items WHERE name = 'Dal Fry' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Dal Tadka
SET @item := (SELECT id FROM menu_items WHERE name = 'Dal Tadka' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Dal Handi
SET @item := (SELECT id FROM menu_items WHERE name = 'Dal Handi' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Dal Makhani
SET @item := (SELECT id FROM menu_items WHERE name = 'Dal Makhani' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Mix Veg Dry
SET @item := (SELECT id FROM menu_items WHERE name = 'Mix Veg Dry' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 20.00, 0, 1),
  (@item, 'Ghee', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Aloo Matar Dry
SET @item := (SELECT id FROM menu_items WHERE name = 'Aloo Matar Dry' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Aloo Matar Masala
SET @item := (SELECT id FROM menu_items WHERE name = 'Aloo Matar Masala' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 20.00, 0, 1),
  (@item, 'Ghee', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Aloo Gobi Dry
SET @item := (SELECT id FROM menu_items WHERE name = 'Aloo Gobi Dry' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 20.00, 0, 1),
  (@item, 'Ghee', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Aloo Gobi Masala
SET @item := (SELECT id FROM menu_items WHERE name = 'Aloo Gobi Masala' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 20.00, 0, 1),
  (@item, 'Ghee', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Tawa Roti
SET @item := (SELECT id FROM menu_items WHERE name = 'Tawa Roti' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Plain', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 10.00, 0, 2);

-- Tawa Paratha
SET @item := (SELECT id FROM menu_items WHERE name = 'Tawa Paratha' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Refined', 0.00, 1, 0),
  (@item, 'Ghee', 10.00, 0, 1),
  (@item, 'Butter', 10.00, 0, 2);

-- Jeera Rice
SET @item := (SELECT id FROM menu_items WHERE name = 'Jeera Rice' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Veg Pulao
SET @item := (SELECT id FROM menu_items WHERE name = 'Veg Pulao' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Matar Pulao
SET @item := (SELECT id FROM menu_items WHERE name = 'Matar Pulao' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Kashmiri Pulao
SET @item := (SELECT id FROM menu_items WHERE name = 'Kashmiri Pulao' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Veg Tawa Biryani
SET @item := (SELECT id FROM menu_items WHERE name = 'Veg Tawa Biryani' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Ghee', 20.00, 0, 1),
  (@item, 'Butter', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- Deluxe Chinese Combo
SET @item := (SELECT id FROM menu_items WHERE name = 'Deluxe Chinese Combo' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Chilli Garlic Noodles x Veg Fried Rice', 0.00, 1, 0),
  (@item, 'Chilli Garlic Noodles x Chilli Garlic Fried Rice', 0.00, 0, 1),
  (@item, 'Chilli Garlic Noodles x Burnt Garlic Fried Rice', 0.00, 0, 2),
  (@item, 'Burnt Garlic Noodles x Veg Fried Rice', 0.00, 0, 3),
  (@item, 'Burnt Garlic Noodles x Chilli Garlic Fried Rice', 0.00, 0, 4),
  (@item, 'Burnt Garlic Noodles x Burnt Garlic Fried Rice', 0.00, 0, 5),
  (@item, 'Singapuri Noodles x Veg Fried Rice', 0.00, 0, 6),
  (@item, 'Singapuri Noodles x Chilli Garlic Fried Rice', 0.00, 0, 7),
  (@item, 'Singapuri Noodles x Burnt Garlic Fried Rice', 0.00, 0, 8),
  (@item, 'Veg Noodles x Veg Fried Rice', 0.00, 0, 9),
  (@item, 'Veg Noodles x Chilli Garlic Fried Rice', 0.00, 0, 10),
  (@item, 'Veg Noodles x Burnt Garlic Fried Rice', 0.00, 0, 11),
  (@item, 'Hakka Noodles x Veg Fried Rice', 0.00, 0, 12),
  (@item, 'Hakka Noodles x Chilli Garlic Fried Rice', 0.00, 0, 13),
  (@item, 'Hakka Noodles x Burnt Garlic Fried Rice', 0.00, 0, 14);

-- Veg Kadhai
SET @item := (SELECT id FROM menu_items WHERE name = 'Veg Kadhai' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @item;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@item, 'Normal', 0.00, 1, 0),
  (@item, 'Butter', 20.00, 0, 1),
  (@item, 'Ghee', 20.00, 0, 2),
  (@item, 'Sarson Tel', 20.00, 0, 3);

-- add-on group: South Indian sides
DELETE a FROM menu_item_addons a WHERE a.item_id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t) AND a.name IN ('Extra Sambhar', 'Coconut Chutney', 'Tomato Chutney', 'Green Chutney', 'Podi with Ghee');
INSERT INTO menu_item_addons (item_id, name, price, available, sort_order)
SELECT id, 'Extra Sambhar', 79.00, 1, 0 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t0)
UNION ALL SELECT id, 'Coconut Chutney', 49.00, 1, 1 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t1)
UNION ALL SELECT id, 'Tomato Chutney', 49.00, 1, 2 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t2)
UNION ALL SELECT id, 'Green Chutney', 49.00, 1, 3 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t3)
UNION ALL SELECT id, 'Podi with Ghee', 69.00, 1, 4 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 11 AND (name LIKE '%Dosa%' OR name LIKE '%Uttapam%' OR name = 'Medu Vada')) t4);

-- add-on group: Extra Cheese
DELETE a FROM menu_item_addons a WHERE a.item_id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 10 AND (name LIKE '%Sandwich%' OR name LIKE '%Wrap%')) t) AND a.name IN ('Extra Cheese');
INSERT INTO menu_item_addons (item_id, name, price, available, sort_order)
SELECT id, 'Extra Cheese', 20.00, 1, 0 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 10 AND (name LIKE '%Sandwich%' OR name LIKE '%Wrap%')) t0);

-- add-on group: Without Vegetables
DELETE a FROM menu_item_addons a WHERE a.item_id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 9 OR name IN ('Chinese Combo Meal', 'Deluxe Chinese Combo')) t) AND a.name IN ('Without Vegetables');
INSERT INTO menu_item_addons (item_id, name, price, available, sort_order)
SELECT id, 'Without Vegetables', 0.00, 1, 0 FROM menu_items WHERE id IN (SELECT id FROM (SELECT id FROM menu_items WHERE category_id = 9 OR name IN ('Chinese Combo Meal', 'Deluxe Chinese Combo')) t0);


-- menu_additions.sql — two dishes that were on Zomato but not here, plus the removal of a
-- junk "1" size on the kebab that Zomato does not have. Safe to re-run: guarded by name.

DELETE v FROM menu_item_variants v JOIN menu_items i ON i.id = v.item_id WHERE i.name = 'Hara Bhara Kebab [8 Pieces]' AND v.name = '1';

INSERT INTO menu_items (category_id, subcategory_id, name, description, price, unit, available, sort_order, branch_id)
SELECT 7, NULL, 'Paneer Manchurian Dry', 'Paneer Manchurian Dry is an Indo-Chinese favorite with crispy paneer cubes, fine chopped onion and bell-peppers tossed in a bold, spicy-sweet sauce of soy, chili, garlic, and ginger.', 249.00, '', 1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_items m), 1
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Paneer Manchurian Dry');

INSERT INTO menu_items (category_id, subcategory_id, name, description, price, unit, available, sort_order, branch_id)
SELECT 12, NULL, 'Methi Matar Malai', 'Methi Malai Matar is a creamy North Indian curry made with fenugreek leaves and green peas.', 299.00, '', 1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_items m), 1
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Methi Matar Malai');

SET @mmm := (SELECT id FROM menu_items WHERE name = 'Methi Matar Malai' LIMIT 1);
DELETE FROM menu_item_variants WHERE item_id = @mmm;
INSERT INTO menu_item_variants (item_id, name, price_delta, is_default, sort_order) VALUES
  (@mmm, 'Normal', 0.00, 1, 0), (@mmm, 'Ghee', 20.00, 0, 1), (@mmm, 'Butter', 20.00, 0, 2), (@mmm, 'Sarson Tel', 20.00, 0, 3);

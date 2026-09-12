-- migration_015_variant_groups.sql — variants belong to a labelled group.
--
-- A dish can carry several radio groups (Preparation: Ghee/Butter; Vegetables:
-- With/Without). Rows sharing a group_label are one radio; a customer picks one
-- per group. Existing rows become "Preparation", which is what they were.
--
-- order_items.variant_ids holds the chosen ids joined by "," (like addon_ids).
-- variant_id stays for orders written before this; readers prefer variant_ids.

ALTER TABLE menu_item_variants ADD COLUMN group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation' AFTER item_id;
ALTER TABLE order_items ADD COLUMN variant_ids VARCHAR(255) NULL AFTER variant_id;

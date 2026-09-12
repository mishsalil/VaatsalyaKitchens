-- migration_014_menu_descriptions.sql — a one-line description per dish.
--
-- Shown under the dish name on the menu, in place of the generic tagline every
-- item used to carry. Short on purpose (160 chars): a menu row is a glance,
-- not a paragraph. NULL / blank means the row shows nothing there.

ALTER TABLE menu_items ADD COLUMN description VARCHAR(160) NULL AFTER name;

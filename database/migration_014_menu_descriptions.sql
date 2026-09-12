-- migration_014_menu_descriptions.sql — a one-line description per dish.
--
-- Shown under the dish name on the menu, in place of the generic tagline every
-- item used to carry. Capped at 500 chars — the menu row clamps it to two lines, so it reads as a
-- glance and the full text is kept. NULL / blank means the row shows nothing.

ALTER TABLE menu_items ADD COLUMN description VARCHAR(500) NULL AFTER name;

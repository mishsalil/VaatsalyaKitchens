-- migration_017_discount_personas.sql — five persona codes.
-- kind gains comeback/everyday; lapsed_days > 0 means "returning customer who
-- has not ordered in N days". discount_auto_pause pauses non-first codes when
-- the month's give-away exceeds the budget.
ALTER TABLE discount_codes MODIFY COLUMN kind ENUM('first','comeback','everyday','flat','big') NOT NULL;
ALTER TABLE discount_codes ADD COLUMN lapsed_days SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER first_order_only;
INSERT IGNORE INTO settings (`key`, value) VALUES ('discount_auto_pause', '0');

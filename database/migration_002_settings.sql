-- =====================================================================
-- Migration 002: editable settings/branding/print header.
-- Adds a simple key/value `settings` table. The admin Settings page writes
-- here; includes/settings.php reads with a fallback to config.php, so the
-- store works before any row exists and config.php stays the source of truth
-- for secrets (VAPID private key, DB credentials) — those are NEVER stored
-- in this table.
--
-- Run once:  mysql -u root vaatsalya_kitchens < database/migration_002_settings.sql
-- Safe to re-run (CREATE TABLE IF NOT EXISTS; seeds use INSERT IGNORE).
-- =====================================================================

CREATE TABLE IF NOT EXISTS settings (
  `key`       VARCHAR(190) NOT NULL PRIMARY KEY,
  `value`     TEXT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed only the non-secret defaults. Contact values (whatsapp/phone/email)
-- are intentionally NOT seeded here — they fall back to config.php until the
-- admin edits them, so the kitchen's real numbers (lives in config.php, not
-- git) aren't duplicated into the DB by the migration.
INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('kitchen_name',    'Vaatsalya Kitchens'),
  ('kitchen_address', ''),
  ('gstin',           ''),
  ('print_footer',    'Thank you for ordering with Vaatsalya Kitchens!'),
  ('logo_path',       NULL);
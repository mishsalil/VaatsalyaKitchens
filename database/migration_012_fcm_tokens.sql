-- migration_012_fcm_tokens.sql
-- FCM registration tokens for the Android app.
--
-- WHY NOT A COLUMN ON THE EXISTING PUSH TABLES
-- push_subscriptions and admin_push_subscriptions are shaped for Web Push: an
-- endpoint URL plus the p256dh and auth keys used to encrypt a payload, all NOT
-- NULL. An FCM token has none of those — it is a single opaque string, and
-- Google does the encrypting. Adding a transport flag would force those three
-- columns nullable and leave half of every row empty whichever transport wrote
-- it, so the constraint that currently guarantees a usable Web Push row would
-- be gone for both.
--
-- WHY ONE TABLE WITH TWO NULLABLE OWNERS
-- A token belongs to a DEVICE, and a device may be nobody in particular. A
-- guest browsing the app should still get "your order is on its way", exactly
-- as push_subscriptions.customer_id is already nullable for that reason. It may
-- also be both: a rep's own phone can be signed in at the counter and be their
-- personal customer account. Two nullable owner columns express all three
-- states honestly, and — unlike the polymorphic subject_type used by
-- auth_tokens — keep real foreign keys, so the delete behaviour matches the
-- tables this sits beside: SET NULL for a customer (the device survives, it
-- just stops being theirs), CASCADE for an admin (a staff member removed from
-- the system must stop receiving kitchen alerts immediately).
--
-- THE TOKEN IS NOT A SECRET, but it is an address: anyone holding it and the
-- project's server key can push to that device. It is unique so a device that
-- re-registers updates its row rather than accumulating duplicates, which is
-- what makes the send path safe to run repeatedly.
--
-- last_seen_at is how a dead device is found later. FCM rejects sends to stale
-- tokens, and that rejection is the signal to delete the row; until the send
-- path exists, this column is what shows which rows are still being refreshed.

CREATE TABLE fcm_tokens (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token        VARCHAR(255) NOT NULL,
  customer_id  INT UNSIGNED NULL,
  admin_id     INT UNSIGNED NULL,
  device_label VARCHAR(80) NULL,
  last_seen_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fcm_token (token(191)),
  KEY idx_fcm_customer (customer_id),
  KEY idx_fcm_admin (admin_id),
  CONSTRAINT fk_fcm_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_fcm_admin FOREIGN KEY (admin_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

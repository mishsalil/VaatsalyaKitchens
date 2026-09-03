-- migration_011_auth_tokens.sql
-- Bearer tokens for API authentication, replacing session cookies.
--
-- WHY AT ALL
-- The native Android app (Capacitor) serves the SPA from https://localhost, so
-- every API call is cross-site. The session cookie is SameSite=Lax and simply
-- will not be sent — the app would be permanently logged out. A token carried in
-- an Authorization header has no origin rules and works identically for the web
-- app, the native app, and anything later.
--
-- SAME SHAPE AS customer_tokens, DELIBERATELY. Selector plus validator, with
-- only a sha256 of the validator stored. The selector is the lookup key so
-- verification is a single indexed read, and the validator is compared with
-- hash_equals, so a stolen database cannot be replayed and lookup timing leaks
-- nothing. This codebase already trusts that pattern for remember-me and claim
-- links; a second, different scheme would be one more thing to get wrong.
--
-- WHY POLYMORPHIC AND NOT TWO TABLES
-- subject_type distinguishes customers from admins, which costs the foreign key
-- and its ON DELETE CASCADE — the one place this schema departs from its own
-- convention. The alternative, two near-identical tables, duplicates every
-- helper that issues, verifies, rotates and revokes. The safety that the FK
-- would have provided is enforced in code instead: verification resolves the
-- subject row on every request and fails closed when it is missing, so a token
-- left behind by a deleted customer or a removed staff member authenticates
-- nobody. What is genuinely lost is tidiness — orphan rows linger until they
-- expire. auth_tokens_purge() sweeps them.
--
-- EXPIRY IS SHORT BY DESIGN. A bearer token lives in localStorage where page
-- JavaScript can read it, unlike the HttpOnly session cookie it replaces. That
-- is the accepted cost of native support, and the mitigation is lifetime: these
-- expire in 30 days and rotate on use, so a leaked token has a bounded life.
-- Remember-me (customer_tokens, 180 days) is unaffected and still HttpOnly.
--
-- device_label is what the customer sees on a "signed-in devices" list and what
-- a manager sees when revoking a lost counter phone. Free text, never trusted.

CREATE TABLE auth_tokens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_type   ENUM('customer','admin') NOT NULL,
  subject_id     INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,              -- sha256 hex
  device_label   VARCHAR(80) NULL,
  expires_at     DATETIME NOT NULL,
  last_used_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_selector (selector),
  KEY idx_auth_tokens_subject (subject_type, subject_id),
  KEY idx_auth_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

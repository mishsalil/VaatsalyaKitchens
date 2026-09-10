# Ratings and Reviews Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a rating for every delivered order, get a bad one in front of a human within the hour, and store per-dish scores for a later aggregation phase.

**Architecture:** Three new tables plus a `delivered_at` column. A cron-driven sweep computes when each order becomes due for a prompt and pushes a tokenised link. The link opens a public, login-free rating page; submitting writes one `order_reviews` row plus per-dish rows, burns the order's tokens, and pushes an alert to admins when the rating is 2 or below. An admin screen lists reviews and records who followed up.

**Tech Stack:** PHP 8.2 (no framework, `includes/` + `api/routes/` front controller), MariaDB, React 18 + TypeScript + Vite + Tailwind, Capacitor Android shell.

**Spec:** `docs/superpowers/specs/2026-09-10-ratings-reviews-phase1-design.md`

## Global Constraints

- **There is no test framework in this repo, by design.** Verification is standalone scripts: `php scripts/verify-*.php` and `node web/scripts/verify-*.mjs`. Do not add jest/phpunit/vitest. Do not write a test that needs a runner.
- **Verification scripts that touch the database build their own throwaway database** and drop it at the end, following `scripts/verify-menu-snapshot.php`. Never run destructive SQL against the developer's real database.
- **Migrations live in three files that must stay in step:** `database/migration_0NN_*.sql` (the numbered file), `database/migrate_production.sql` (idempotent, `information_schema`-guarded), and `database/install_fresh.sql`. `scripts/verify-cumulative-migration.php` and `scripts/verify-install-file.php` check this.
- **PHP is not on PATH.** Use the XAMPP binary: `C:\xampp\php\php.exe`. Commands below are written as `php` for readability.
- **The local database is `vaatsalya_kitchens`** (per `includes/config.php`), and the MySQL client is `C:\xampp\mysql\bin\mysql.exe`.
- **The migration number for this feature is 013.**
- **Never render customer-typed text with `dangerouslySetInnerHTML`.** React escapes by default; that is the whole defence.
- **Absolute URLs sent to customers use `publicUrl()`** from `web/src/apps/shared/lib/baseUrl.ts`, never `window.location.origin` — the packaged APK's origin is `https://localhost`.
- **Server-side capability checks are the security boundary**; `web/src/apps/admin/rbac.ts` is a UX mirror only.
- **The urgent notification channel (`vk_urgent`) is reserved for new orders.** Review alerts use the default channel.
- **Commit after every task.** Conventional-commit prefixes, matching repo history (`feat:`, `fix:`, `chore:`).

---

### Task 1: Schema — migration 013

**Files:**
- Create: `database/migration_013_reviews.sql`
- Modify: `database/migrate_production.sql` (append a new guarded block before the final verification `SELECT` union)
- Modify: `database/install_fresh.sql` (append the `CREATE TABLE`s; add `delivered_at` to the `orders` definition)
- Test: `scripts/verify-review-schema.php`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `order_reviews`, `order_item_reviews`, `review_prompts`, `review_tokens`; column `orders.delivered_at DATETIME NULL`; settings key `reviews_since`.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-review-schema.php`:

```php
<?php
/* Proves migration_013 produces the same shape whether a database is built
   fresh (install_fresh.sql) or migrated from an older one
   (migrate_production.sql), and that re-running the cumulative migration is a
   no-op. The two paths drifting apart is the failure this catches. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

function run(PDO $pdo, array $files): void {
    foreach ($files as $f) {
        foreach (stmts($f) as $s) {
            if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) {
                $st = $pdo->query($s); $st->fetchAll(); $st->closeCursor();
            } else {
                $pdo->exec($s);
            }
        }
    }
}

function columns(PDO $pdo, string $db, string $table): array {
    $st = $pdo->prepare(
        'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY COLUMN_NAME'
    );
    $st->execute([$db, $table]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; }
    else     { $fail++; echo "  FAIL $what\n"; }
}

$fresh = 'vk_rev_schema_fresh';
$pdo->exec("DROP DATABASE IF EXISTS `$fresh`");
$pdo->exec("CREATE DATABASE `$fresh` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$fresh`");
run($pdo, ['database/install_fresh.sql']);
echo "built fresh from install_fresh.sql\n";

$tables = ['order_reviews', 'order_item_reviews', 'review_prompts', 'review_tokens'];
foreach ($tables as $t) {
    check("fresh has table $t", columns($pdo, $fresh, $t) !== []);
}
check('fresh orders has delivered_at', array_filter(
    columns($pdo, $fresh, 'orders'), fn($c) => $c['COLUMN_NAME'] === 'delivered_at'
) !== []);
check('fresh has reviews_since setting', (int)$pdo->query(
    "SELECT COUNT(*) FROM settings WHERE `key` = 'reviews_since'"
)->fetchColumn() === 1);

/* The migrated path: an old database is install_fresh MINUS this migration,
   which we approximate by building fresh then dropping what 013 added. */
$migrated = 'vk_rev_schema_migrated';
$pdo->exec("DROP DATABASE IF EXISTS `$migrated`");
$pdo->exec("CREATE DATABASE `$migrated` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$migrated`");
run($pdo, ['database/install_fresh.sql']);
foreach (array_reverse($tables) as $t) { $pdo->exec("DROP TABLE IF EXISTS `$t`"); }
$pdo->exec('ALTER TABLE orders DROP COLUMN delivered_at');
$pdo->exec("DELETE FROM settings WHERE `key` = 'reviews_since'");
echo "built a pre-013 database\n";

run($pdo, ['database/migrate_production.sql']);
echo "applied migrate_production.sql\n";
foreach ($tables as $t) {
    check("migrated has table $t", columns($pdo, $migrated, $t) !== []);
    check("$t identical on both paths", columns($pdo, $fresh, $t) == columns($pdo, $migrated, $t));
}
check('migrated orders has delivered_at', array_filter(
    columns($pdo, $migrated, 'orders'), fn($c) => $c['COLUMN_NAME'] === 'delivered_at'
) !== []);

run($pdo, ['database/migrate_production.sql']);
echo "applied migrate_production.sql a second time\n";
foreach ($tables as $t) {
    check("$t unchanged after re-run", columns($pdo, $fresh, $t) == columns($pdo, $migrated, $t));
}

$pdo->exec("DROP DATABASE IF EXISTS `$fresh`");
$pdo->exec("DROP DATABASE IF EXISTS `$migrated`");

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php scripts/verify-review-schema.php`
Expected: FAIL — `fresh has table order_reviews` and every sibling check fails, because nothing has been added yet.

- [ ] **Step 3: Write `database/migration_013_reviews.sql`**

```sql
-- migration_013_reviews.sql — ratings and reviews, phase 1.
--
-- Captures one rating per order plus optional per-dish stars, and the state
-- needed to prompt for it exactly once. Review text is INTERNAL: nothing here
-- is rendered on the public storefront.

ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL AFTER status;

CREATE TABLE IF NOT EXISTS order_reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  stars       TINYINT UNSIGNED NOT NULL,
  comment     TEXT NULL,
  source      ENUM('link','account') NOT NULL DEFAULT 'link',
  acked_at    DATETIME NULL,
  acked_by    INT UNSIGNED NULL,
  acked_label VARCHAR(120) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_order (order_id),
  KEY idx_review_stars_created (stars, created_at),
  CONSTRAINT fk_review_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No FK to order_items or menu_items on purpose: a menu item can be deleted,
-- and a rating of a dish we no longer sell is still a fact about a meal we
-- served. The write path validates that order_item_id belongs to the order.
CREATE TABLE IF NOT EXISTS order_item_reviews (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id     INT UNSIGNED NOT NULL,
  order_item_id INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NULL,
  stars         TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_item_review (review_id, order_item_id),
  KEY idx_item_review_menu (menu_item_id),
  CONSTRAINT fk_item_review_review FOREIGN KEY (review_id)
    REFERENCES order_reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_prompts (
  order_id    INT UNSIGNED PRIMARY KEY,
  due_at      DATETIME NOT NULL,
  sent_at     DATETIME NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_prompt_due (sent_at, due_at),
  CONSTRAINT fk_prompt_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Many tokens per order. The plaintext validator exists only at creation, so a
-- single stored token would force rotation on "copy link", killing a link push
-- already delivered. Every issuance appends; submitting burns them all.
CREATE TABLE IF NOT EXISTS review_tokens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,
  expires_at     DATETIME NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_token_selector (selector),
  KEY idx_review_token_order (order_id),
  CONSTRAINT fk_review_token_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The cutover. The sweep ignores orders created before this moment, so
-- switching the cron on does not message every customer in the database about
-- a meal from months ago.
INSERT INTO settings (`key`, `value`)
VALUES ('reviews_since', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
ON DUPLICATE KEY UPDATE `key` = `key`;
```

- [ ] **Step 4: Append the same statements to `database/install_fresh.sql`**

Add `delivered_at DATETIME NULL` to the `orders` `CREATE TABLE` (after `status`), then append the four `CREATE TABLE IF NOT EXISTS` blocks and the `reviews_since` insert verbatim from Step 3 at the end of the file, under a comment header matching the file's existing style:

```sql
-- --- migration_013: ratings and reviews (phase 1) --------------------------
```

- [ ] **Step 5: Append a guarded block to `database/migrate_production.sql`**

Insert before the file's closing verification `SELECT ... UNION ALL` block, in the existing idempotent style:

```sql
-- --- migration_013: ratings and reviews (phase 1) --------------------------
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL AFTER status')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='delivered_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
```

The four `CREATE TABLE IF NOT EXISTS` statements are already idempotent — paste them unchanged. Then the settings row, unchanged (its `ON DUPLICATE KEY UPDATE` makes re-running safe).

Then add these lines into the closing verification union, matching the surrounding format exactly:

```sql
UNION ALL SELECT 'orders.delivered_at',   IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='delivered_at'
UNION ALL SELECT 'table order_reviews',      IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_reviews'
UNION ALL SELECT 'table order_item_reviews', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_item_reviews'
UNION ALL SELECT 'table review_prompts',     IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='review_prompts'
UNION ALL SELECT 'table review_tokens',      IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='review_tokens'
```

- [ ] **Step 6: Run the verification and the two existing migration checks**

Run:
```bash
php scripts/verify-review-schema.php
php scripts/verify-cumulative-migration.php
php scripts/verify-install-file.php
```
Expected: all three PASS. If `verify-review-schema.php` reports a table differing between paths, the two files have drifted — fix the file, do not relax the check.

- [ ] **Step 7: Apply the migration to the local development database**

Run: `C:\xampp\mysql\bin\mysql.exe -u root vaatsalya_kitchens < database/migration_013_reviews.sql`
Expected: no errors. Later tasks need these tables locally.

- [ ] **Step 8: Commit**

```bash
git add database/migration_013_reviews.sql database/migrate_production.sql database/install_fresh.sql scripts/verify-review-schema.php
git commit -m "feat(reviews): add phase 1 schema for ratings and reviews"
```

---

### Task 2: Eligibility and due-time rules

**Files:**
- Create: `includes/reviews.php`
- Modify: `api/routes/admin/orders.php` (set `delivered_at` on transition to `delivered`)
- Test: `scripts/verify-review-due.php`

**Interfaces:**
- Consumes: Task 1's `orders.delivered_at`.
- Produces:
  - `review_eligible_status(string $status): bool`
  - `review_due_at(array $order): ?string` — `'Y-m-d H:i:s'`, or `null` when the order is not eligible. `$order` needs keys `status`, `delivered_at`, `needed_at`, `created_at`.
  - `const REVIEW_DELAY_DELIVERED_MIN = 30;`
  - `const REVIEW_DELAY_FALLBACK_MIN = 60;`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-review-due.php`:

```php
<?php
/* The 30/60-minute rule, exhaustively. These are pure functions over an order
   row, so this needs no database at all.

   The case worth staring at is the third block: counter orders never get
   needed_at (api/routes/admin/orders.php does not insert it), so created_at is
   not a fallback for missing data — it IS the counter path. */

chdir(__DIR__ . '/..');
require 'includes/reviews.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}

function order(array $over = []): array {
    return array_merge([
        'status'       => 'delivered',
        'delivered_at' => null,
        'needed_at'    => null,
        'created_at'   => '2026-09-10 12:00:00',
    ], $over);
}

echo "eligibility by status\n";
check('delivered is eligible',        true,  review_eligible_status('delivered'));
check('confirmed is eligible',        true,  review_eligible_status('confirmed'));
check('preparing is eligible',        true,  review_eligible_status('preparing'));
check('out_for_delivery is eligible', true,  review_eligible_status('out_for_delivery'));
check('new is NOT eligible',          false, review_eligible_status('new'));
check('cancelled is NOT eligible',    false, review_eligible_status('cancelled'));
check('unknown is NOT eligible',      false, review_eligible_status('banana'));

echo "\ndelivered_at drives the 30-minute rule\n";
check('delivered_at + 30', '2026-09-10 14:30:00',
    review_due_at(order(['delivered_at' => '2026-09-10 14:00:00'])));
check('delivered_at wins over needed_at', '2026-09-10 14:30:00',
    review_due_at(order(['delivered_at' => '2026-09-10 14:00:00', 'needed_at' => '2026-09-10 09:00:00'])));

echo "\nno delivered_at falls back 60 minutes\n";
check('needed_at + 60', '2026-09-10 14:00:00',
    review_due_at(order(['needed_at' => '2026-09-10 13:00:00'])));
check('counter order: created_at + 60', '2026-09-10 13:00:00',
    review_due_at(order()));
check('fallback applies to a non-delivered status', '2026-09-10 13:00:00',
    review_due_at(order(['status' => 'preparing'])));

echo "\nineligible orders have no due time at all\n";
check('new order', null, review_due_at(order(['status' => 'new'])));
check('cancelled order', null, review_due_at(order(['status' => 'cancelled'])));
check('cancelled even when delivered_at is set', null,
    review_due_at(order(['status' => 'cancelled', 'delivered_at' => '2026-09-10 14:00:00'])));

echo "\nmidnight and month boundaries\n";
check('crosses midnight', '2026-09-11 00:15:00',
    review_due_at(order(['delivered_at' => '2026-09-10 23:45:00'])));
check('crosses month end', '2026-10-01 00:20:00',
    review_due_at(order(['delivered_at' => '2026-09-30 23:50:00'])));
check('crosses year end on the fallback', '2027-01-01 00:30:00',
    review_due_at(order(['needed_at' => '2026-12-31 23:30:00'])));

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php scripts/verify-review-due.php`
Expected: FAIL — a PHP fatal error, `includes/reviews.php` does not exist.

- [ ] **Step 3: Write `includes/reviews.php`**

```php
<?php
/* Ratings and reviews — eligibility and timing (migration_013).

   Pure functions over an order row. No database access here on purpose: the
   sweep, the admin screen and the verification script all need the same answer
   to "when is this order due for a prompt?", and a pure function is the only
   version of that answer that can be checked exhaustively. */

/** Minutes after a delivery is MARKED before we ask. */
const REVIEW_DELAY_DELIVERED_MIN = 30;

/** Minutes after the scheduled (or counter) time when delivery was never marked. */
const REVIEW_DELAY_FALLBACK_MIN = 60;

/* `new` is excluded because an order nobody confirmed was probably never
   cooked, and `cancelled` because there is nothing to rate. The three middle
   statuses ARE prompted on the fallback: in practice food goes out and nobody
   touches the screen, and treating that as "never delivered" would lose most
   of the ratings we are building this for. */
function review_eligible_status(string $status): bool
{
    return in_array($status, ['confirmed', 'preparing', 'out_for_delivery', 'delivered'], true);
}

/**
 * When this order becomes due for a review prompt, or null if it never does.
 *
 * needed_at is NULL for every counter order — api/routes/admin/orders.php does
 * not insert it — so created_at is not a guess about missing data, it is the
 * walk-in path, where the food was served immediately.
 */
function review_due_at(array $order): ?string
{
    if (!review_eligible_status((string)($order['status'] ?? ''))) {
        return null;
    }

    $delivered = $order['delivered_at'] ?? null;
    if ($delivered) {
        $base = new DateTimeImmutable((string)$delivered);
        $mins = REVIEW_DELAY_DELIVERED_MIN;
    } else {
        $base = new DateTimeImmutable((string)($order['needed_at'] ?? $order['created_at']));
        $mins = REVIEW_DELAY_FALLBACK_MIN;
    }

    return $base->modify('+' . $mins . ' minutes')->format('Y-m-d H:i:s');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `php scripts/verify-review-due.php`
Expected: PASS, `18 passed, 0 failed`. If the count is lower, a check was skipped — investigate rather than accepting a green run.

- [ ] **Step 5: Set `delivered_at` when status becomes `delivered`**

In `api/routes/admin/orders.php`, both status-writing paths (the `status` action near line 98 and the bulk/rider path near line 648) run an `UPDATE orders SET status = ?`. Change each to also stamp the column:

```php
db()->prepare(
    'UPDATE orders
        SET status = ?,
            delivered_at = CASE WHEN ? = \'delivered\' AND delivered_at IS NULL
                                THEN NOW() ELSE delivered_at END
      WHERE id = ?'
)->execute([$status, $status, $orderId]);
```

`delivered_at IS NULL` guards it: an order re-marked delivered keeps the first timestamp, so re-saving an order does not silently push its review prompt an hour into the future.

Read the surrounding code before editing — match the existing variable names (`$status`, `$orderId` or `$id`) rather than assuming these.

- [ ] **Step 6: Verify the stamp by hand against the local database**

Run:
```bash
php -r "chdir('.'); require 'includes/db.php'; \$o = db()->query('SELECT id, status, delivered_at FROM orders ORDER BY id DESC LIMIT 3')->fetchAll(PDO::FETCH_ASSOC); print_r(\$o);"
```
Then mark an order delivered through the admin UI and re-run.
Expected: `delivered_at` populated for that order, unchanged on a second save.

- [ ] **Step 7: Commit**

```bash
git add includes/reviews.php scripts/verify-review-due.php api/routes/admin/orders.php
git commit -m "feat(reviews): eligibility and due-time rules, stamp orders.delivered_at"
```

---

### Task 3: Review tokens

**Files:**
- Create: `includes/review_tokens.php`
- Test: `scripts/verify-review-tokens.php`

**Interfaces:**
- Consumes: Task 1's `review_tokens` table.
- Produces:
  - `const REVIEW_TOKEN_DAYS = 14;`
  - `review_token_issue(int $orderId): string` — returns `"selector.validator"`.
  - `review_token_resolve(?string $token): ?int` — returns the order id, or null. **Does not burn.**
  - `review_tokens_burn(int $orderId): void` — deletes every token for the order.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-review-tokens.php`:

```php
<?php
/* Review tokens: issue, resolve, burn. Same selector/validator shape as claim
   tokens (includes/auth.php), with one deliberate difference — resolving does
   NOT burn, because a customer who opens the link and comes back later must
   still be able to rate. Burning happens on submit.

   Runs against a throwaway database. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_tokens_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

require 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}

$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Token Test', '9999900002')");
$custId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Token Test', '9999900002', 'today', 'delivered', 100, 100, 1)");
$orderId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Token Test', '9999900002', 'today', 'delivered', 100, 100, 1)");
$otherOrder = (int)$pdo->lastInsertId();

echo "issue and resolve\n";
$t1 = review_token_issue($orderId);
check('token has selector.validator shape', 1, substr_count($t1, '.'));
check('resolves to the order', $orderId, review_token_resolve($t1));
check('resolving twice still works (not burned)', $orderId, review_token_resolve($t1));

echo "\nmany tokens per order, all valid\n";
$t2 = review_token_issue($orderId);
check('second token differs', true, $t1 !== $t2);
check('first token still resolves', $orderId, review_token_resolve($t1));
check('second token resolves', $orderId, review_token_resolve($t2));

echo "\nrejections\n";
check('null', null, review_token_resolve(null));
check('empty', null, review_token_resolve(''));
check('no dot', null, review_token_resolve('garbage'));
check('unknown selector', null, review_token_resolve('aaaaaaaaaaaaaaaaaaaaaaaa.bbbb'));
[$sel, $val] = explode('.', $t1, 2);
check('tampered validator', null, review_token_resolve($sel . '.' . strrev($val)));
check('right selector, other order validator', null,
    review_token_resolve($sel . '.' . explode('.', review_token_issue($otherOrder), 2)[1]));

echo "\nexpiry\n";
$expired = review_token_issue($orderId);
[$eSel] = explode('.', $expired, 2);
$pdo->prepare('UPDATE review_tokens SET expires_at = ? WHERE selector = ?')
    ->execute([(new DateTime('-1 hour'))->format('Y-m-d H:i:s'), $eSel]);
check('expired token rejected', null, review_token_resolve($expired));
check('unexpired sibling still fine', $orderId, review_token_resolve($t1));

echo "\nburn takes them all\n";
review_tokens_burn($orderId);
check('first burned', null, review_token_resolve($t1));
check('second burned', null, review_token_resolve($t2));
check('other order untouched', 1,
    (int)$pdo->query("SELECT COUNT(*) FROM review_tokens WHERE order_id = $otherOrder")->fetchColumn());

echo "\nvalidator is never stored in plaintext\n";
$t3 = review_token_issue($orderId);
[$s3, $v3] = explode('.', $t3, 2);
$st = $pdo->prepare('SELECT validator_hash FROM review_tokens WHERE selector = ?');
$st->execute([$s3]);
$stored = (string)$st->fetchColumn();
check('stored value is not the validator', true, $stored !== $v3);
check('stored value is its sha256', hash('sha256', $v3), $stored);

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php scripts/verify-review-tokens.php`
Expected: FAIL — fatal error, `includes/review_tokens.php` does not exist.

- [ ] **Step 3: Write `includes/review_tokens.php`**

```php
<?php
/* Tokens that grant exactly one right: rating one order.

   Same selector/validator shape as the claim tokens in includes/auth.php — the
   selector is the indexed lookup, only a sha256 of the validator is stored, and
   comparison is hash_equals. A stolen database yields nothing replayable.

   Three deliberate differences from a claim token:

   1. Resolving does NOT burn. A customer opens the link, gets distracted, comes
      back — burning on first view would lose the review. Burning happens on
      successful submit, and the UNIQUE on order_reviews.order_id is the real
      guard against a second review.
   2. It is NOT a session. It must never be accepted by auth_token_resolve(),
      which is why it lives in its own table rather than in auth_tokens.
   3. Many tokens can be live for one order. The plaintext validator exists only
      at creation, so "copy the rating link" for an order that already has one
      would otherwise have to rotate it and kill the link push already sent. */

require_once __DIR__ . '/db.php';

const REVIEW_TOKEN_DAYS = 14;

/** Issue a token for an order. Returns "selector.validator" — the only moment
 *  the validator exists in plaintext. Return it to the caller, never log it. */
function review_token_issue(int $orderId): string
{
    $selector  = bin2hex(random_bytes(12));      // 24 chars, matches the column
    $validator = bin2hex(random_bytes(32));

    db()->prepare(
        'INSERT INTO review_tokens (order_id, selector, validator_hash, expires_at)
         VALUES (?, ?, ?, ?)'
    )->execute([
        $orderId,
        $selector,
        hash('sha256', $validator),
        (new DateTime('+' . REVIEW_TOKEN_DAYS . ' days'))->format('Y-m-d H:i:s'),
    ]);

    return $selector . '.' . $validator;
}

/** Resolve a token to its order id, or null. Does not burn, does not extend. */
function review_token_resolve(?string $token): ?int
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return null;
    }
    [$selector, $validator] = explode('.', $token, 2);

    $stmt = db()->prepare('SELECT * FROM review_tokens WHERE selector = ? AND expires_at > NOW()');
    $stmt->execute([$selector]);
    $row = $stmt->fetch();

    if (!$row || !hash_equals($row['validator_hash'], hash('sha256', $validator))) {
        return null;
    }
    return (int)$row['order_id'];
}

/** Burn every token for an order — called once the review is in. */
function review_tokens_burn(int $orderId): void
{
    db()->prepare('DELETE FROM review_tokens WHERE order_id = ?')->execute([$orderId]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `php scripts/verify-review-tokens.php`
Expected: PASS, `19 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add includes/review_tokens.php scripts/verify-review-tokens.php
git commit -m "feat(reviews): tokens granting the right to rate one order"
```

---

### Task 4: Dish grouping for the rating page

**Files:**
- Create: `web/src/apps/shared/lib/rateLines.ts`
- Test: `web/scripts/verify-rate-lines.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RateOrderItem = { order_item_id: number; menu_item_id: number | null; item_name: string; qty: number }`
  - `type RateLine = { key: string; label: string; qty: number; orderItemIds: number[] }`
  - `groupRateLines(items: RateOrderItem[]): RateLine[]`

- [ ] **Step 1: Write the failing verification script**

Create `web/scripts/verify-rate-lines.mjs`:

```js
/**
 * Dish grouping for the rating page.
 *
 * A party order lists the same dish several times across variants. Asking
 * someone to rate paneer three times is how you get no ratings at all, so the
 * page groups by menu_item_id — but the DATABASE still stores one row per
 * order_items row, so every group must carry the ids it covers.
 *
 * Order lines created before migration_007 have menu_item_id = null and can
 * never be attributed to a dish; those group by name instead, and must never
 * be merged with each other just because they are both null.
 *
 * Uses esbuild to strip the types rather than a regex. A test harness that
 * needs its own parser is a test harness that will lie to you.
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/rateLines.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { groupRateLines } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

const item = (id, menuId, name, qty = 1) =>
  ({ order_item_id: id, menu_item_id: menuId, item_name: name, qty });

console.log('the simple case');
check('one line, one group', [{ key: 'm:7', label: 'Paneer Butter Masala', qty: 2, orderItemIds: [1] }],
  groupRateLines([item(1, 7, 'Paneer Butter Masala', 2)]));

console.log('\nsame dish across variants collapses');
check('two variants of one dish',
  [{ key: 'm:7', label: 'Paneer Butter Masala', qty: 3, orderItemIds: [1, 2] }],
  groupRateLines([item(1, 7, 'Paneer Butter Masala', 2), item(2, 7, 'Paneer Butter Masala', 1)]));

console.log('\ndifferent dishes stay apart, in first-seen order');
check('two dishes', [
  { key: 'm:7', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'm:9', label: 'Dal', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, 7, 'Paneer'), item(2, 9, 'Dal')]));

console.log('\npre-migration_007 lines group by name, never by null');
check('two different unattributed dishes stay apart', [
  { key: 'n:Paneer', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'n:Dal', label: 'Dal', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, null, 'Paneer'), item(2, null, 'Dal')]));

check('same unattributed dish merges',
  [{ key: 'n:Paneer', label: 'Paneer', qty: 4, orderItemIds: [1, 2] }],
  groupRateLines([item(1, null, 'Paneer', 3), item(2, null, 'Paneer', 1)]));

check('an id-bearing line never merges with a null one', [
  { key: 'm:7', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'n:Paneer', label: 'Paneer', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, 7, 'Paneer'), item(2, null, 'Paneer')]));

console.log('\nedges');
check('empty order', [], groupRateLines([]));
check('quantities sum, not count', [{ key: 'm:7', label: 'P', qty: 12, orderItemIds: [1, 2] }],
  groupRateLines([item(1, 7, 'P', 5), item(2, 7, 'P', 7)]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && node scripts/verify-rate-lines.mjs`
Expected: FAIL — `ENOENT`, `rateLines.ts` does not exist.

- [ ] **Step 3: Write `web/src/apps/shared/lib/rateLines.ts`**

```ts
/**
 * Grouping order lines into the dishes a customer is asked to rate.
 *
 * Grouping is a presentation concern only. The database stores one
 * order_item_reviews row per order_items row, so every group carries the ids it
 * covers and the caller expands its chosen star back across them.
 */

export type RateOrderItem = {
  order_item_id: number;
  menu_item_id: number | null;
  item_name: string;
  qty: number;
};

export type RateLine = {
  /** Stable React key. `m:<id>` when the dish is known, `n:<name>` otherwise. */
  key: string;
  label: string;
  qty: number;
  orderItemIds: number[];
};

/**
 * Group by menu_item_id, falling back to the item name.
 *
 * The fallback is not cosmetic: order lines created before migration_007 have
 * menu_item_id = null. Grouping those by the null itself would merge every
 * unattributed dish in the order into one row labelled after whichever came
 * first, so they group by name instead — and a null-id line never merges with
 * an id-bearing one, because we cannot prove they are the same dish.
 */
export function groupRateLines(items: RateOrderItem[]): RateLine[] {
  const byKey = new Map<string, RateLine>();

  for (const item of items) {
    const key = item.menu_item_id !== null ? `m:${item.menu_item_id}` : `n:${item.item_name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += item.qty;
      existing.orderItemIds.push(item.order_item_id);
    } else {
      byKey.set(key, {
        key,
        label: item.item_name,
        qty: item.qty,
        orderItemIds: [item.order_item_id],
      });
    }
  }

  return [...byKey.values()];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && node scripts/verify-rate-lines.mjs`
Expected: PASS, `8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/src/apps/shared/lib/rateLines.ts web/scripts/verify-rate-lines.mjs
git commit -m "feat(reviews): group order lines into dishes for the rating page"
```

---

### Task 5: The public rating API

**Files:**
- Create: `api/routes/reviews.php`
- Test: `scripts/verify-review-validation.php`

**Interfaces:**
- Consumes: `review_token_resolve()`, `review_tokens_burn()` (Task 3); `review_eligible_status()` (Task 2).
- Produces:
  - `GET /api/reviews/{token}` → `{ order_id, ordered_on, first_name, already_reviewed, lines: [{ order_item_id, menu_item_id, item_name, qty }] }`
  - `POST /api/reviews/{token}` → `{ success }` or an error. Body: `{ stars: 1..5, comment?: string, items?: [{ order_item_id, stars }] }`
  - `review_submit(int $orderId, int $stars, ?string $comment, array $items, string $source): int` in `includes/reviews.php` — returns the new review id. Extracted so the verification script can exercise it without an HTTP layer.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-review-validation.php`:

```php
<?php
/* Everything the submit path must refuse. Runs review_submit() directly against
   a throwaway database — the HTTP layer above it only unpacks JSON, and the
   rules that matter are here. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_validation_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

require 'includes/reviews.php';
/* require_once, not require: includes/reviews.php already pulls this in, and a
   second plain require fatals with "Cannot redeclare review_token_issue()". */
require_once 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; } else { $fail++; echo "  FAIL $what\n"; }
}
/** Returns the exception message, or '' when the call succeeded. */
function refuses(callable $fn): string {
    try { $fn(); return ''; } catch (Throwable $e) { return $e->getMessage(); }
}

$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Val Test', '9999900003')");
$custId = (int)$pdo->lastInsertId();
function makeOrder(PDO $pdo, int $custId): array {
    $pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
                VALUES ($custId, 'Val Test', '9999900003', 'today', 'delivered', 100, 100, 1)");
    $orderId = (int)$pdo->lastInsertId();
    $ins = $pdo->prepare('INSERT INTO order_items (order_id, menu_item_id, item_name, unit, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    $ins->execute([$orderId, 7, 'Paneer', 'plate', 200, 1]);
    $lineA = (int)$pdo->lastInsertId();
    $ins->execute([$orderId, 9, 'Dal', 'plate', 100, 1]);
    $lineB = (int)$pdo->lastInsertId();
    return [$orderId, $lineA, $lineB];
}

[$orderA, $a1, $a2] = makeOrder($pdo, $custId);
[$orderB, $b1, ]    = makeOrder($pdo, $custId);

echo "stars must be an integer 1..5\n";
foreach ([0, 6, -1, 99] as $bad) {
    check("refuses stars = $bad", refuses(fn() => review_submit($orderA, $bad, null, [], 'link')) !== '');
}
check('accepts stars = 1', refuses(fn() => review_submit($orderA, 1, null, [], 'link')) === '');

echo "\none review per order\n";
check('refuses a second review', refuses(fn() => review_submit($orderA, 5, null, [], 'link')) !== '');
check('still exactly one row', (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderA")->fetchColumn() === 1);

echo "\ncomment length\n";
[$orderC, $c1, ] = makeOrder($pdo, $custId);
check('accepts 1000 characters', refuses(fn() => review_submit($orderC, 4, str_repeat('x', 1000), [], 'link')) === '');
[$orderD, , ] = makeOrder($pdo, $custId);
check('refuses 1001 characters', refuses(fn() => review_submit($orderD, 4, str_repeat('x', 1001), [], 'link')) !== '');

echo "\nper-dish rows must belong to the order\n";
[$orderE, $e1, $e2] = makeOrder($pdo, $custId);
check('refuses a line from another order',
    refuses(fn() => review_submit($orderE, 4, null, [['order_item_id' => $b1, 'stars' => 5]], 'link')) !== '');
check('nothing was written on refusal',
    (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderE")->fetchColumn() === 0);
check('accepts this order\'s own lines',
    refuses(fn() => review_submit($orderE, 4, null,
        [['order_item_id' => $e1, 'stars' => 5], ['order_item_id' => $e2, 'stars' => 2]], 'link')) === '');
check('wrote both dish rows', (int)$pdo->query(
    "SELECT COUNT(*) FROM order_item_reviews r JOIN order_reviews o ON o.id = r.review_id WHERE o.order_id = $orderE"
)->fetchColumn() === 2);
check('denormalised menu_item_id', (int)$pdo->query(
    "SELECT menu_item_id FROM order_item_reviews r JOIN order_reviews o ON o.id = r.review_id
      WHERE o.order_id = $orderE AND r.order_item_id = $e1"
)->fetchColumn() === 7);

echo "\nper-dish stars are validated too\n";
[$orderF, $f1, ] = makeOrder($pdo, $custId);
check('refuses a dish rated 0',
    refuses(fn() => review_submit($orderF, 4, null, [['order_item_id' => $f1, 'stars' => 0]], 'link')) !== '');
check('nothing written', (int)$pdo->query("SELECT COUNT(*) FROM order_reviews WHERE order_id = $orderF")->fetchColumn() === 0);

echo "\ncancelled orders cannot be rated\n";
$pdo->exec("INSERT INTO orders (customer_id, name, phone, needed_on, status, total_estimate, subtotal, branch_id)
            VALUES ($custId, 'Val Test', '9999900003', 'today', 'cancelled', 100, 100, 1)");
$cancelled = (int)$pdo->lastInsertId();
check('refuses a cancelled order', refuses(fn() => review_submit($cancelled, 5, null, [], 'link')) !== '');

echo "\nsubmitting burns the order's tokens\n";
[$orderG, , ] = makeOrder($pdo, $custId);
$tok = review_token_issue($orderG);
check('token valid before', review_token_resolve($tok) === $orderG);
review_submit($orderG, 5, null, [], 'link');
check('token dead after', review_token_resolve($tok) === null);

echo "\ncomment is stored verbatim, never escaped at rest\n";
[$orderH, , ] = makeOrder($pdo, $custId);
$raw = "<script>alert(1)</script> बहुत अच्छा";
review_submit($orderH, 5, $raw, [], 'link');
check('stored byte-for-byte', $pdo->query(
    "SELECT comment FROM order_reviews WHERE order_id = $orderH")->fetchColumn() === $raw);

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php scripts/verify-review-validation.php`
Expected: FAIL — `Call to undefined function review_submit()`.

- [ ] **Step 3: Add `review_submit()` to `includes/reviews.php`**

Append:

```php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/review_tokens.php';

/** Longest comment we store. Beyond this it is not feedback, it is a payload. */
const REVIEW_COMMENT_MAX = 1000;

/**
 * Write a review. Throws InvalidArgumentException on any refusal, and writes
 * nothing when it does — the whole thing runs in one transaction so a bad dish
 * row cannot leave a half-written review behind.
 *
 * Callers: the public POST route, and the verification script.
 */
function review_submit(int $orderId, int $stars, ?string $comment, array $items, string $source): int
{
    if ($stars < 1 || $stars > 5) {
        throw new InvalidArgumentException('Please choose between 1 and 5 stars.');
    }
    if (!in_array($source, ['link', 'account'], true)) {
        throw new InvalidArgumentException('Unknown review source.');
    }

    $comment = $comment === null ? null : trim($comment);
    if ($comment === '') {
        $comment = null;
    }
    if ($comment !== null && mb_strlen($comment) > REVIEW_COMMENT_MAX) {
        throw new InvalidArgumentException('That comment is too long.');
    }

    $db = db();
    $stmt = $db->prepare('SELECT id, customer_id, status FROM orders WHERE id = ?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        throw new InvalidArgumentException('That order no longer exists.');
    }
    if (!review_eligible_status((string)$order['status'])) {
        throw new InvalidArgumentException('That order cannot be rated.');
    }

    /* Every dish row must belong to THIS order. Without this check a token for
       one order could write ratings against another customer's dishes. */
    $lines = [];
    $lStmt = $db->prepare('SELECT id, menu_item_id FROM order_items WHERE order_id = ?');
    $lStmt->execute([$orderId]);
    foreach ($lStmt->fetchAll() as $l) {
        $lines[(int)$l['id']] = $l['menu_item_id'] === null ? null : (int)$l['menu_item_id'];
    }
    foreach ($items as $item) {
        $lineId = (int)($item['order_item_id'] ?? 0);
        $lineStars = (int)($item['stars'] ?? 0);
        if (!array_key_exists($lineId, $lines)) {
            throw new InvalidArgumentException('That dish is not part of this order.');
        }
        if ($lineStars < 1 || $lineStars > 5) {
            throw new InvalidArgumentException('Please choose between 1 and 5 stars for each dish.');
        }
    }

    $db->beginTransaction();
    try {
        $db->prepare(
            'INSERT INTO order_reviews (order_id, customer_id, stars, comment, source)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$orderId, $order['customer_id'], $stars, $comment, $source]);
        $reviewId = (int)$db->lastInsertId();

        $ins = $db->prepare(
            'INSERT INTO order_item_reviews (review_id, order_item_id, menu_item_id, stars)
             VALUES (?, ?, ?, ?)'
        );
        foreach ($items as $item) {
            $lineId = (int)$item['order_item_id'];
            $ins->execute([$reviewId, $lineId, $lines[$lineId], (int)$item['stars']]);
        }

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        /* 23000 is the integrity-constraint family; here it is the UNIQUE on
           order_id, i.e. this order was already rated. */
        if ($e->getCode() === '23000') {
            throw new InvalidArgumentException('This order has already been rated.');
        }
        throw $e;
    }

    review_tokens_burn($orderId);
    return $reviewId;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `php scripts/verify-review-validation.php`
Expected: PASS, `20 passed, 0 failed` (the four bad-star cases come from one `foreach`, so the
assertion count exceeds the number of `check(` lines).

- [ ] **Step 5: Write `api/routes/reviews.php`**

```php
<?php
/* Public rating endpoints, authenticated by a review token and nothing else.

   GET  /api/reviews/{token}  — the order, as the rating page needs it
   POST /api/reviews/{token}  — submit the rating

   A review token is a WEAKER credential than a session: it travels in a URL,
   through WhatsApp, and possibly through a group chat. So this route returns
   only what the page must render — no phone number, no address, no totals. */

require_once __DIR__ . '/../../includes/reviews.php';
require_once __DIR__ . '/../../includes/review_tokens.php';
require_once __DIR__ . '/../../includes/push.php';

function route($method, $action, $parts): void
{
    $token = (string)($parts[1] ?? '');
    if ($token === '') {
        Response::error('Rating link not found.', 404);
    }

    /* Rate limit on the selector, matching how claim redemption is guarded in
       api/routes/auth.php. Guessing a validator is infeasible; this stops
       someone hammering the endpoint from trying. */
    $throttleKey = 'review:' . substr($token, 0, 24);
    if (too_many_attempts($throttleKey)) {
        Response::error('Too many attempts. Please try again later.', 429);
    }

    $orderId = review_token_resolve($token);
    if ($orderId === null) {
        record_attempt($throttleKey);
        Response::error('This rating link has expired or has already been used.', 404);
    }

    if ($method === 'GET') {
        review_route_get($orderId);
    }
    if ($method === 'POST') {
        review_route_post($orderId);
    }
    Response::error('Method not allowed', 405);
}

function review_route_get(int $orderId): void
{
    $db = db();
    $stmt = $db->prepare(
        'SELECT o.id, o.name, o.created_at,
                (SELECT COUNT(*) FROM order_reviews r WHERE r.order_id = o.id) AS reviewed
           FROM orders o WHERE o.id = ?'
    );
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        Response::error('That order no longer exists.', 404);
    }

    $lStmt = $db->prepare(
        'SELECT id AS order_item_id, menu_item_id, item_name, qty
           FROM order_items WHERE order_id = ? ORDER BY id'
    );
    $lStmt->execute([$orderId]);

    $lines = array_map(fn($l) => [
        'order_item_id' => (int)$l['order_item_id'],
        'menu_item_id'  => $l['menu_item_id'] === null ? null : (int)$l['menu_item_id'],
        'item_name'     => $l['item_name'],
        'qty'           => (int)$l['qty'],
    ], $lStmt->fetchAll());

    /* First name only. The full name is not needed to say hello, and this link
       may be sitting in a group chat. */
    $firstName = trim(explode(' ', trim((string)$order['name']))[0] ?? '');

    Response::json([
        'order_id'         => (int)$order['id'],
        'ordered_on'       => $order['created_at'],
        'first_name'       => $firstName,
        'already_reviewed' => (int)$order['reviewed'] > 0,
        'lines'            => $lines,
    ]);
}

function review_route_post(int $orderId): void
{
    $stars   = (int)($_POST['stars'] ?? 0);
    $comment = isset($_POST['comment']) ? (string)$_POST['comment'] : null;
    $items   = is_array($_POST['items'] ?? null) ? $_POST['items'] : [];

    /* `account` when the request ALSO carries a valid customer token for this
       order's customer. It records which channel is earning its keep and is
       never used for authorisation — the review token alone decides that. */
    $customer = current_customer();
    $source = 'link';
    if ($customer) {
        $stmt = db()->prepare('SELECT customer_id FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        if ((int)$stmt->fetchColumn() === (int)$customer['id']) {
            $source = 'account';
        }
    }

    try {
        review_submit($orderId, $stars, $comment, $items, $source);
    } catch (InvalidArgumentException $e) {
        /* Already-rated is a conflict, not a bad request: the client should
           show the thank-you state rather than ask the customer to try again. */
        $alreadyRated = str_contains($e->getMessage(), 'already been rated');
        Response::error($e->getMessage(), $alreadyRated ? 409 : 400);
    }

    if ($stars <= 2) {
        /* Deliberately the DEFAULT channel. vk_urgent and OrderAlarmService
           ring at full volume through silent mode, which is right for an order
           nobody has seen and wrong for a bad review at 11pm. */
        push_send_to_admins(
            'Low rating received',
            $stars . '-star rating on order #' . $orderId,
            '/admin/reviews'
        );
    }

    Response::success('Thank you for the feedback');
}
```

- [ ] **Step 6: Exercise both endpoints against the running dev API**

Start the API if it is not up (`C:\xampp\php\php.exe -S localhost:8081 router.php`), then mint a token and call it:

```bash
php -r "chdir('.'); require 'includes/db.php'; require 'includes/review_tokens.php'; \$id=(int)db()->query('SELECT id FROM orders WHERE status=\'delivered\' ORDER BY id DESC LIMIT 1')->fetchColumn(); echo review_token_issue(\$id), \"\n\";"
```

Then, with that token:
```bash
curl -s http://localhost:8081/api/reviews/<token>
curl -s -X POST http://localhost:8081/api/reviews/<token> -H "Content-Type: application/json" -d "{\"stars\":5}"
curl -s -X POST http://localhost:8081/api/reviews/<token> -H "Content-Type: application/json" -d "{\"stars\":5}"
```
Expected: the order JSON; then `{"success":...}`; then `404` — the tokens were burned by the first submit.

- [ ] **Step 7: Commit**

```bash
git add includes/reviews.php api/routes/reviews.php scripts/verify-review-validation.php
git commit -m "feat(reviews): public rating endpoints and submit validation"
```

---

### Task 6: The prompt sweep

**Files:**
- Create: `scripts/send-review-prompts.php`
- Modify: `includes/reviews.php` (add `review_prompt_candidates()` and `review_prompt_record()`)
- Test: `scripts/verify-review-sweep.php`

**Interfaces:**
- Consumes: `review_due_at()` (Task 2), `review_token_issue()` (Task 3), `push_send_to_customer()` (existing).
- Produces:
  - `review_prompt_candidates(int $limit = 50): array` — order rows that are past due, unrated, un-prompted or retryable, and created at or after `reviews_since`.
  - `review_prompt_record(int $orderId, string $dueAt, bool $sent, ?string $error): void` — upserts the `review_prompts` row.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-review-sweep.php`:

```php
<?php
/* Which orders the sweep picks up, and which it must leave alone.
   The dangerous failure here is a false positive — messaging a customer about
   a meal from months ago, or twice about the same one. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

$db = 'vk_review_sweep_test';
$pdo->exec("DROP DATABASE IF EXISTS `$db`");
$pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$db`");
foreach (stmts('database/install_fresh.sql') as $s) {
    if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $pdo->query($s)->fetchAll(); } else { $pdo->exec($s); }
}

require 'includes/reviews.php';
require 'includes/review_tokens.php';

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; } else { $fail++; echo "  FAIL $what\n"; }
}
function ids(array $rows): array { return array_map(fn($r) => (int)$r['id'], $rows); }

$pdo->exec("UPDATE settings SET `value` = '2026-09-01 00:00:00' WHERE `key` = 'reviews_since'");
$pdo->exec("INSERT INTO customers (name, phone) VALUES ('Sweep Test', '9999900004')");
$custId = (int)$pdo->lastInsertId();

/** Insert an order with explicit timing. */
function mk(PDO $pdo, int $custId, string $status, ?string $deliveredAt, ?string $neededAt, string $createdAt): int {
    $st = $pdo->prepare(
        'INSERT INTO orders (customer_id, name, phone, needed_on, needed_at, status, delivered_at,
                             total_estimate, subtotal, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 100, 100, 1, ?)'
    );
    $st->execute([$custId, 'Sweep Test', '9999900004', 'today', $neededAt, $status, $deliveredAt, $createdAt]);
    return (int)$pdo->lastInsertId();
}

$long = (new DateTime('-1 day'))->format('Y-m-d H:i:s');
$recent = (new DateTime('-5 minutes'))->format('Y-m-d H:i:s');

echo "picked up\n";
$due       = mk($pdo, $custId, 'delivered', $long, null, $long);
$fallback  = mk($pdo, $custId, 'preparing', null, $long, $long);
$counter   = mk($pdo, $custId, 'delivered', null, null, $long);
$got = ids(review_prompt_candidates());
check('delivered and past due', in_array($due, $got, true));
check('never marked delivered, past the fallback', in_array($fallback, $got, true));
check('counter order with no needed_at', in_array($counter, $got, true));

echo "\nleft alone\n";
$tooSoon   = mk($pdo, $custId, 'delivered', $recent, null, $recent);
$isNew     = mk($pdo, $custId, 'new', null, null, $long);
$cancelled = mk($pdo, $custId, 'cancelled', $long, null, $long);
$historic  = mk($pdo, $custId, 'delivered', '2026-08-01 12:00:00', null, '2026-08-01 12:00:00');
$got = ids(review_prompt_candidates());
check('not yet due', !in_array($tooSoon, $got, true));
check('status new', !in_array($isNew, $got, true));
check('cancelled', !in_array($cancelled, $got, true));
check('created before reviews_since', !in_array($historic, $got, true));

echo "\nalready rated\n";
$rated = mk($pdo, $custId, 'delivered', $long, null, $long);
$pdo->exec("INSERT INTO order_reviews (order_id, customer_id, stars) VALUES ($rated, $custId, 5)");
check('rated order dropped', !in_array($rated, ids(review_prompt_candidates()), true));

echo "\nprompt state\n";
review_prompt_record($due, review_due_at(['status' => 'delivered', 'delivered_at' => $long,
    'needed_at' => null, 'created_at' => $long]), true, null);
check('sent order dropped', !in_array($due, ids(review_prompt_candidates()), true));
check('sent_at recorded',
    $pdo->query("SELECT sent_at FROM review_prompts WHERE order_id = $due")->fetchColumn() !== null);

$dueAt = review_due_at(['status' => 'preparing', 'delivered_at' => null, 'needed_at' => $long, 'created_at' => $long]);
review_prompt_record($fallback, $dueAt, false, 'no subscription');
check('failed once, still a candidate', in_array($fallback, ids(review_prompt_candidates()), true));
review_prompt_record($fallback, $dueAt, false, 'no subscription');
review_prompt_record($fallback, $dueAt, false, 'no subscription');
check('after three failures it goes quiet', !in_array($fallback, ids(review_prompt_candidates()), true));
check('the error is kept for diagnosis',
    $pdo->query("SELECT last_error FROM review_prompts WHERE order_id = $fallback")->fetchColumn() === 'no subscription');

echo "\ndue_at is refreshed, not frozen\n";
$late = mk($pdo, $custId, 'confirmed', null, $long, $long);
review_prompt_record($late, review_due_at(['status' => 'confirmed', 'delivered_at' => null,
    'needed_at' => $long, 'created_at' => $long]), false, 'nope');
$deliveredNow = (new DateTime('-40 minutes'))->format('Y-m-d H:i:s');
$pdo->exec("UPDATE orders SET status = 'delivered', delivered_at = '$deliveredNow' WHERE id = $late");
$rows = array_values(array_filter(review_prompt_candidates(), fn($r) => (int)$r['id'] === $late));
check('still a candidate after delivery was marked', $rows !== []);
check('recomputed due_at uses delivered_at + 30',
    $rows !== [] && review_due_at($rows[0]) === (new DateTime($deliveredNow))->modify('+30 minutes')->format('Y-m-d H:i:s'));

$pdo->exec("DROP DATABASE IF EXISTS `$db`");
echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php scripts/verify-review-sweep.php`
Expected: FAIL — `Call to undefined function review_prompt_candidates()`.

- [ ] **Step 3: Add the two functions to `includes/reviews.php`**

Append:

```php
require_once __DIR__ . '/settings.php';

/** How many times we try to push before giving up on an order. */
const REVIEW_PROMPT_MAX_ATTEMPTS = 3;

/**
 * Orders that are due for a prompt right now.
 *
 * SQL narrows; review_due_at() decides. The due-time comparison is deliberately
 * NOT in SQL: it is the one rule with real edge cases, and having it in a pure
 * PHP function is what lets verify-review-due.php check it exhaustively.
 * The SQL below is only the cheap filter that keeps the row count small.
 */
function review_prompt_candidates(int $limit = 50): array
{
    $since = setting('reviews_since', '1970-01-01 00:00:00');

    $stmt = db()->prepare(
        'SELECT o.id, o.customer_id, o.status, o.delivered_at, o.needed_at, o.created_at
           FROM orders o
           LEFT JOIN order_reviews  r ON r.order_id = o.id
           LEFT JOIN review_prompts p ON p.order_id = o.id
          WHERE o.created_at >= ?
            AND o.customer_id IS NOT NULL
            AND o.status IN (\'confirmed\', \'preparing\', \'out_for_delivery\', \'delivered\')
            AND r.id IS NULL
            AND (p.order_id IS NULL OR (p.sent_at IS NULL AND p.attempts < ?))
          ORDER BY o.id
          LIMIT ' . (int)($limit * 4)
    );
    $stmt->execute([$since, REVIEW_PROMPT_MAX_ATTEMPTS]);

    $now = new DateTimeImmutable();
    $due = [];
    foreach ($stmt->fetchAll() as $order) {
        $dueAt = review_due_at($order);
        if ($dueAt !== null && new DateTimeImmutable($dueAt) <= $now) {
            $due[] = $order;
            if (count($due) >= $limit) {
                break;
            }
        }
    }
    return $due;
}

/**
 * Record the outcome of a prompt attempt.
 *
 * due_at is rewritten every pass on purpose. A row can be created by the manual
 * rating-link endpoint before delivery, when the computed value is the
 * 60-minute fallback; once delivery is marked the right answer becomes
 * delivered_at + 30. The stored column is a cache for display, never the truth.
 */
function review_prompt_record(int $orderId, string $dueAt, bool $sent, ?string $error): void
{
    db()->prepare(
        'INSERT INTO review_prompts (order_id, due_at, sent_at, attempts, last_error)
         VALUES (?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
            due_at     = VALUES(due_at),
            sent_at    = COALESCE(review_prompts.sent_at, VALUES(sent_at)),
            attempts   = review_prompts.attempts + 1,
            last_error = VALUES(last_error)'
    )->execute([
        $orderId,
        $dueAt,
        $sent ? (new DateTime())->format('Y-m-d H:i:s') : null,
        $error === null ? null : mb_substr($error, 0, 190),
    ]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `php scripts/verify-review-sweep.php`
Expected: PASS, `15 passed, 0 failed`.

- [ ] **Step 5: Write `scripts/send-review-prompts.php`**

```php
<?php
/* Sends review prompts that have come due. Run from cron every 5 minutes:
 *
 *   /usr/bin/php /home/<user>/domains/vaatsalyakitchens.in/scripts/send-review-prompts.php
 *
 * This is the ONLY scheduled job in the project. It exists because the agreed
 * rule — 60 minutes after the scheduled time when delivery was never marked —
 * cannot be served from a status-change handler: the whole point of that case
 * is that no status change happened.
 *
 * Safe to run concurrently: a MySQL advisory lock means a second copy exits
 * immediately rather than double-prompting.
 */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/helpers.php';
require 'includes/reviews.php';
require 'includes/review_tokens.php';
require 'includes/push.php';

$verbose = in_array('--verbose', $argv, true);
function say(string $line): void {
    global $verbose;
    if ($verbose) { echo $line, "\n"; }
}

$db = db();

/* 0 = do not wait. Two overlapping runs is a real possibility on a 5-minute
   schedule with a slow push round-trip, not a theoretical one. */
if ((int)$db->query("SELECT GET_LOCK('vk_review_prompts', 0)")->fetchColumn() !== 1) {
    say('another run holds the lock; exiting');
    exit(0);
}

try {
    $candidates = review_prompt_candidates(50);
    say(count($candidates) . ' order(s) due');

    $sent = 0; $failed = 0;
    foreach ($candidates as $order) {
        $orderId = (int)$order['id'];
        $dueAt   = review_due_at($order);
        if ($dueAt === null) {
            continue;   // status changed under us between query and loop
        }

        try {
            $token = review_token_issue($orderId);
            $result = push_send_to_customer(
                (int)$order['customer_id'],
                'How was your meal?',
                'Tap to rate your order — it takes a few seconds.',
                '/rate/' . $token
            );
            $ok = ($result['sent'] ?? 0) > 0;
            review_prompt_record($orderId, $dueAt, $ok, $ok ? null : 'no delivery target');
            $ok ? $sent++ : $failed++;
            say(sprintf('  order #%d: %s', $orderId, $ok ? 'sent' : 'no delivery target'));
        } catch (Throwable $e) {
            /* One bad order must never stop the batch. */
            review_prompt_record($orderId, $dueAt, false, $e->getMessage());
            $failed++;
            say(sprintf('  order #%d: %s', $orderId, $e->getMessage()));
        }
    }

    say("sent=$sent failed=$failed");
} finally {
    $db->query("SELECT RELEASE_LOCK('vk_review_prompts')");
}
```

- [ ] **Step 6: Run the sweep against the local database**

Run: `php scripts/send-review-prompts.php --verbose`
Expected: it reports how many orders are due and exits 0. Run it a second time immediately — the same orders must not be sent twice (they now have `sent_at`, or three failed attempts).

- [ ] **Step 7: Commit**

```bash
git add includes/reviews.php scripts/send-review-prompts.php scripts/verify-review-sweep.php
git commit -m "feat(reviews): cron sweep that prompts for a rating when an order comes due"
```

---

### Task 7: Admin API and the `reviews` capability

**Files:**
- Create: `api/routes/admin/reviews.php`
- Modify: `includes/admin_roles.php` (add the `reviews` cap to four roles)
- Modify: `web/src/apps/admin/rbac.ts` (mirror it)
- Modify: `api/routes/admin/orders.php` (add the `rating_link` action)
- Modify: `api/routes/admin/dashboard.php` (add the unacknowledged-low-rating count)

**Interfaces:**
- Consumes: `review_token_issue()` (Task 3).
- Produces:
  - `GET /api/admin/reviews?min_stars=&max_stars=&acked=&page=` → `{ reviews: [...], total }`
  - `POST /api/admin/reviews/ack/{id}` → `{ success }`
  - `POST /api/admin/orders/rating_link/{id}` → `{ token, days }`
  - Dashboard field `low_reviews_unacked: number`

- [ ] **Step 1: Add the capability on both sides**

In `includes/admin_roles.php`, add `'reviews'` to the capability-string comment block and to `admin_caps_for_role()` for `super`, `admin`, `manager` and `staff`. **Not `rider`** — a rider marks deliveries and has no business reading customer complaints.

In `web/src/apps/admin/rbac.ts`, add `| 'reviews'` to `AdminCap` and `'reviews'` to the same four entries of `CAPS_BY_ROLE`.

- [ ] **Step 2: Verify the two lists agree**

Run:
```bash
php -r "chdir('.'); require 'includes/admin_roles.php'; foreach (admin_roles() as \$r) { echo \$r, ': ', implode(' ', admin_caps_for_role(\$r)), \"\n\"; }"
```
Then read `CAPS_BY_ROLE` in `web/src/apps/admin/rbac.ts` and confirm each role's list matches exactly. A mismatch means a nav item that renders and then 403s.

- [ ] **Step 3: Write `api/routes/admin/reviews.php`**

```php
<?php
/* Admin reviews — the internal feedback list. Review text is never public;
   this is the only place it is read. */

require_once __DIR__ . '/../../../includes/reviews.php';

function route($method, $action, $parts): void
{
    $admin = require_admin_cap('reviews');

    if ($action === 'index' && $method === 'GET') {
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $per   = 25;
        $where = [];
        $args  = [];

        if (isset($_GET['min_stars']) && $_GET['min_stars'] !== '') {
            $where[] = 'r.stars >= ?';
            $args[]  = (int)$_GET['min_stars'];
        }
        if (isset($_GET['max_stars']) && $_GET['max_stars'] !== '') {
            $where[] = 'r.stars <= ?';
            $args[]  = (int)$_GET['max_stars'];
        }
        if (($_GET['acked'] ?? '') === '0') {
            $where[] = 'r.acked_at IS NULL';
        } elseif (($_GET['acked'] ?? '') === '1') {
            $where[] = 'r.acked_at IS NOT NULL';
        }
        $sql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

        $countStmt = db()->prepare('SELECT COUNT(*) FROM order_reviews r' . $sql);
        $countStmt->execute($args);
        $total = (int)$countStmt->fetchColumn();

        $stmt = db()->prepare(
            'SELECT r.id, r.order_id, r.stars, r.comment, r.source, r.created_at,
                    r.acked_at, r.acked_label, o.name, o.phone
               FROM order_reviews r
               JOIN orders o ON o.id = r.order_id' . $sql . '
              ORDER BY r.created_at DESC, r.id DESC
              LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per)
        );
        $stmt->execute($args);
        $reviews = $stmt->fetchAll();

        // Per-dish rows for the page of reviews we are returning, in one query.
        $byReview = [];
        $ids = array_map(fn($r) => (int)$r['id'], $reviews);
        if ($ids) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $dStmt = db()->prepare(
                "SELECT ir.review_id, ir.stars, ir.menu_item_id, oi.item_name
                   FROM order_item_reviews ir
                   LEFT JOIN order_items oi ON oi.id = ir.order_item_id
                  WHERE ir.review_id IN ($ph)"
            );
            $dStmt->execute($ids);
            foreach ($dStmt->fetchAll() as $d) {
                $byReview[(int)$d['review_id']][] = [
                    'item_name' => $d['item_name'] ?? 'Removed item',
                    'stars'     => (int)$d['stars'],
                ];
            }
        }

        Response::json([
            'total'   => $total,
            'reviews' => array_map(fn($r) => [
                'id'          => (int)$r['id'],
                'order_id'    => (int)$r['order_id'],
                'stars'       => (int)$r['stars'],
                'comment'     => $r['comment'],
                'source'      => $r['source'],
                'created_at'  => $r['created_at'],
                'acked_at'    => $r['acked_at'],
                'acked_label' => $r['acked_label'],
                'name'        => $r['name'],
                'phone'       => $r['phone'],
                'dishes'      => $byReview[(int)$r['id']] ?? [],
            ], $reviews),
        ]);
    }

    if ($action === 'ack' && $method === 'POST') {
        $id = (int)($parts[3] ?? 0);
        if ($id <= 0) {
            Response::error('Which review?', 400);
        }
        $stmt = db()->prepare(
            'UPDATE order_reviews
                SET acked_at = NOW(), acked_by = ?, acked_label = ?
              WHERE id = ? AND acked_at IS NULL'
        );
        $stmt->execute([(int)$admin['id'], (string)$admin['username'], $id]);
        Response::success('Marked as followed up');
    }

    Response::error('Method not allowed', 405);
}
```

- [ ] **Step 4: Add the `rating_link` action to `api/routes/admin/orders.php`**

Next to the existing `claim_link` action (around line 313), add:

```php
    /* --- shareable rating link, for sending over WhatsApp by hand ---
       Issues a FRESH token every time rather than reusing one: the plaintext
       validator only exists at creation, and rotating a stored one would kill
       the link the push already delivered. Many tokens per order is the design
       (see includes/review_tokens.php). */
    if ($action === 'rating_link' && $method === 'POST') {
        require_admin_cap('orders');
        $orderId = (int)($parts[3] ?? 0);
        $stmt = db()->prepare('SELECT id, status FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if (!$order) {
            Response::error('Order not found', 404);
        }
        require_once __DIR__ . '/../../../includes/reviews.php';
        require_once __DIR__ . '/../../../includes/review_tokens.php';
        if (!review_eligible_status((string)$order['status'])) {
            Response::error('This order cannot be rated yet.', 400);
        }
        Response::json([
            'token' => review_token_issue($orderId),
            'days'  => REVIEW_TOKEN_DAYS,
        ]);
    }
```

Match the surrounding code's variable naming and cap-check style — read the `claim_link` block directly above before writing this.

- [ ] **Step 5: Add the dashboard count**

In `api/routes/admin/dashboard.php`, add to the response payload:

```php
'low_reviews_unacked' => (int)db()->query(
    'SELECT COUNT(*) FROM order_reviews WHERE stars <= 2 AND acked_at IS NULL'
)->fetchColumn(),
```

- [ ] **Step 6: Exercise the endpoints**

With the dev API running and an admin bearer token in `$T`:

```bash
curl -s -H "Authorization: Bearer $T" "http://localhost:8081/api/admin/reviews?acked=0"
curl -s -X POST -H "Authorization: Bearer $T" http://localhost:8081/api/admin/orders/rating_link/<orderId>
curl -s -H "Authorization: Bearer $T" http://localhost:8081/api/admin/dashboard
```
Expected: a review list with a `dishes` array on each row; a fresh token; a dashboard payload containing `low_reviews_unacked`.

Then confirm the cap actually bites: sign in as a rider and call `/api/admin/reviews`.
Expected: `403`.

- [ ] **Step 7: Commit**

```bash
git add api/routes/admin/reviews.php api/routes/admin/orders.php api/routes/admin/dashboard.php includes/admin_roles.php web/src/apps/admin/rbac.ts
git commit -m "feat(reviews): admin review list, follow-up tracking, shareable rating link"
```

---

### Task 8: The customer rating page

**Files:**
- Create: `web/src/apps/storefront/pages/Rate.tsx`
- Create: `web/src/apps/storefront/components/StarInput.tsx`
- Modify: `web/src/App.tsx` (add the `/rate/:token` route)

**Interfaces:**
- Consumes: `groupRateLines()` (Task 4); `GET`/`POST /api/reviews/{token}` (Task 5).
- Produces: the route `/rate/:token`.

- [ ] **Step 1: Write `web/src/apps/storefront/components/StarInput.tsx`**

```tsx
import { Star } from 'lucide-react';

/**
 * A row of five stars. Buttons, not a radio group, because the whole point is
 * that one tap finishes the job — and each button carries its own accessible
 * name so a screen reader user is not left counting unlabelled controls.
 */
export function StarInput({
  value,
  onChange,
  size = 'lg',
  label,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: 'sm' | 'lg';
  label: string;
}) {
  const box = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value === n}
          className={`${box} flex items-center justify-center rounded-lg transition active:scale-95`}
        >
          <Star
            className={`${size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} ${
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-brand-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `web/src/apps/storefront/pages/Rate.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { groupRateLines, type RateOrderItem } from '../../shared/lib/rateLines';
import { StarInput } from '../components/StarInput';

type RateOrder = {
  order_id: number;
  ordered_on: string;
  first_name: string;
  already_reviewed: boolean;
  lines: RateOrderItem[];
};

/**
 * Rating one order, opened from a link with no login.
 *
 * The overall star is the only required answer and submitting is enabled the
 * moment it is given. Dishes and the comment appear only AFTER that first tap:
 * showing a six-dish checklist to someone who has not yet decided to engage is
 * how a rating prompt gets closed.
 */
export default function Rate() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<RateOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`reviews/${token}`)
      .then((data: RateOrder) => {
        if (cancelled) return;
        setOrder(data);
        if (data.already_reviewed) setDone(true);
      })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  const lines = useMemo(() => groupRateLines(order?.lines ?? []), [order]);

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      /* Expand each group's star back across every order_items row it covers,
         so the stored rows match the order one-for-one. */
      const items = lines.flatMap((line) => {
        const s = dishStars[line.key];
        return s ? line.orderItemIds.map((id) => ({ order_item_id: id, stars: s })) : [];
      });
      await api.post(`reviews/${token}`, { stars, comment: comment.trim() || undefined, items });
      setDone(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-brand-900">This link isn't valid</h1>
        <p className="mt-2 text-sm text-brand-600">{loadError}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-brand-900">Thank you!</h1>
        <p className="mt-2 text-sm text-brand-600">
          Your feedback goes straight to our kitchen.
        </p>
      </div>
    );
  }

  if (!order) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-brand-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-brand-900">
        {order.first_name ? `${order.first_name}, how was it?` : 'How was your meal?'}
      </h1>
      <p className="mt-1 text-sm text-brand-600">Order #{order.order_id}</p>

      <div className="mt-6 flex justify-center">
        <StarInput value={stars} onChange={setStars} label="Overall rating" />
      </div>

      {stars > 0 && (
        <div className="mt-8 space-y-6 animate-slide-up">
          {lines.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-brand-800">
                Rate the dishes <span className="font-normal text-brand-500">(optional)</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-brand-800">
                      {line.label}
                      {line.qty > 1 && <span className="text-brand-500"> ×{line.qty}</span>}
                    </span>
                    <StarInput
                      size="sm"
                      label={`Rating for ${line.label}`}
                      value={dishStars[line.key] ?? 0}
                      onChange={(s) => setDishStars((prev) => ({ ...prev, [line.key]: s }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="rate-comment" className="text-sm font-medium text-brand-800">
              Anything else? <span className="font-normal text-brand-500">(optional)</span>
            </label>
            <textarea
              id="rate-comment"
              value={comment}
              maxLength={1000}
              rows={4}
              onChange={(e) => setComment(e.target.value)}
              className="mt-2 w-full rounded-xl border border-cream-200 p-3 text-sm text-brand-900"
              placeholder="What went well, what didn't"
            />
          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full rounded-xl bg-brand-800 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      )}
    </div>
  );
}
```

Before writing this, read `web/src/apps/storefront/pages/Claim.tsx` and one other storefront page to confirm the API client's import path and call shape (`api.get` / `api.post` versus a named export) and the Tailwind colour tokens in use. Match what is there; the classes above follow `brand-*` / `cream-*` as seen in `Modal.tsx`.

- [ ] **Step 3: Add the route in `web/src/App.tsx`**

Beside the existing `/claim/:token` route (line 51), inside the `CustomerLayout` element:

```tsx
<Route path="/rate/:token" element={<Rate />} />
```

with `import Rate from './apps/storefront/pages/Rate';` alongside the other storefront page imports.

- [ ] **Step 4: Type-check and build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Exercise the page in the browser**

Mint a token (see Task 5 Step 6), start the Vite dev server, and open `/rate/<token>`.
Verify by hand:
- Dishes and comment are hidden until the first star is tapped.
- A dish ordered twice appears once, with the quantities summed.
- Submitting shows the thank-you state.
- Reloading the same URL now reports an invalid link — the tokens were burned.

- [ ] **Step 6: Commit**

```bash
git add web/src/apps/storefront/pages/Rate.tsx web/src/apps/storefront/components/StarInput.tsx web/src/App.tsx
git commit -m "feat(reviews): customer rating page at /rate/:token"
```

---

### Task 9: The pending-review card

**Files:**
- Modify: `api/routes/account.php` (add the `pending-review` action)
- Create: `web/src/apps/storefront/components/PendingReviewCard.tsx`
- Modify: `web/src/apps/storefront/pages/Home.tsx` and `web/src/apps/storefront/pages/MyAccount.tsx`

**Interfaces:**
- Consumes: `review_prompt_candidates()` is **not** used here; this queries directly by customer. `review_token_issue()` (Task 3), `review_due_at()` (Task 2).
- Produces: `GET /api/account/pending-review` → `{ order_id, token } | { order_id: null }`.

- [ ] **Step 1: Add the endpoint**

`api/routes/account.php` currently handles only `set-pin` and rejects everything else at the top. Restructure it to dispatch on `$action`, keeping `set-pin` byte-identical, and add:

```php
    /* The in-app door to the rating page. This is how a customer who never
       granted push permission gets asked at all — which, on a storefront, is
       most of them. */
    if ($action === 'pending-review' && $method === 'GET') {
        require_once __DIR__ . '/../../includes/reviews.php';
        require_once __DIR__ . '/../../includes/review_tokens.php';

        $stmt = db()->prepare(
            'SELECT o.id, o.status, o.delivered_at, o.needed_at, o.created_at
               FROM orders o
               LEFT JOIN order_reviews r ON r.order_id = o.id
              WHERE o.customer_id = ?
                AND o.created_at >= ?
                AND r.id IS NULL
              ORDER BY o.id DESC
              LIMIT 5'
        );
        $stmt->execute([$customer['id'], setting('reviews_since', '1970-01-01 00:00:00')]);

        $now = new DateTimeImmutable();
        foreach ($stmt->fetchAll() as $order) {
            $dueAt = review_due_at($order);
            if ($dueAt !== null && new DateTimeImmutable($dueAt) <= $now) {
                Response::json([
                    'order_id' => (int)$order['id'],
                    'token'    => review_token_issue((int)$order['id']),
                ]);
            }
        }
        Response::json(['order_id' => null]);
    }
```

Note `require_once __DIR__ . '/../../includes/settings.php';` at the top if `setting()` is not already reachable — `includes/reviews.php` requires it, so importing reviews first is sufficient.

- [ ] **Step 2: Verify the endpoint by hand**

With a customer bearer token in `$C`:
```bash
curl -s -H "Authorization: Bearer $C" http://localhost:8081/api/account/pending-review
```
Expected: `{"order_id":null}` when nothing is due; an order id and token once a delivered order of that customer is past due. Confirm `set-pin` still works after the restructure:
```bash
curl -s -X POST -H "Authorization: Bearer $C" -H "Content-Type: application/json" -d "{\"pin\":\"1234\"}" http://localhost:8081/api/account/set-pin
```

- [ ] **Step 3: Write `web/src/apps/storefront/components/PendingReviewCard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { api } from '../../shared/api/client';

/**
 * Prompts a signed-in customer to rate their last order.
 *
 * Renders nothing at all when there is nothing due, and swallows its own
 * errors: a failed request here must never disturb the page it sits on.
 */
export function PendingReviewCard() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('account/pending-review')
      .then((d: { order_id: number | null; token?: string }) => {
        if (!cancelled && d.order_id && d.token) setToken(d.token);
      })
      .catch(() => { /* nothing to prompt is indistinguishable from a failure here, and both mean: show nothing */ });
    return () => { cancelled = true; };
  }, []);

  if (!token) return null;

  return (
    <Link
      to={`/rate/${token}`}
      className="mb-4 flex items-center gap-3 rounded-xl border border-cream-200 bg-white p-4 shadow-card"
    >
      <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" />
      <span className="flex-1 text-sm text-brand-800">
        How was your last order? <span className="text-brand-500">Tap to rate</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Mount it on both pages**

In `web/src/apps/storefront/pages/Home.tsx` and `MyAccount.tsx`, render `<PendingReviewCard />` near the top of the page content. Read each file first and place it inside the existing content wrapper so it inherits the page's horizontal padding rather than sitting flush against the viewport edge.

The component renders `null` for signed-out visitors because the request 401s — no extra guard is needed, but confirm this by loading Home in a private window.

- [ ] **Step 5: Type-check, build, and check both pages**

Run: `cd web && npx tsc --noEmit && npm run build`
Then load Home and My Account signed in with a due order, and signed out.
Expected: card visible in the first case, absent in the second, no console errors either way.

- [ ] **Step 6: Commit**

```bash
git add api/routes/account.php web/src/apps/storefront/components/PendingReviewCard.tsx web/src/apps/storefront/pages/Home.tsx web/src/apps/storefront/pages/MyAccount.tsx
git commit -m "feat(reviews): in-app pending review card for customers without push"
```

---

### Task 10: The admin reviews screen

**Files:**
- Create: `web/src/apps/admin/pages/Reviews.tsx`
- Modify: `web/src/apps/admin/AdminArea.tsx` (route)
- Modify: `web/src/apps/admin/layout/AdminLayout.tsx` (nav item)
- Modify: `web/src/apps/admin/pages/Dashboard.tsx` (tile)

**Interfaces:**
- Consumes: `GET /api/admin/reviews`, `POST /api/admin/reviews/ack/{id}` (Task 7); the `reviews` cap (Task 7).
- Produces: the route `/admin/reviews`.

- [ ] **Step 1: Write `web/src/apps/admin/pages/Reviews.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Star, Phone, Check } from 'lucide-react';
import { adminApi } from '../api/client';

type Dish = { item_name: string; stars: number };
type Review = {
  id: number;
  order_id: number;
  stars: number;
  comment: string | null;
  source: string;
  created_at: string;
  acked_at: string | null;
  acked_label: string | null;
  name: string;
  phone: string;
  dishes: Dish[];
};

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-brand-200'}`} />
      ))}
    </span>
  );
}

/**
 * The internal feedback list. Nothing here is public.
 *
 * Defaults to unacknowledged low ratings, because the reason this screen exists
 * is to get someone on the phone to an unhappy customer today — not to browse
 * praise.
 */
export function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [onlyLowUnacked, setOnlyLowUnacked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* adminApi prepends "admin/" itself (see adminUrl in the admin client),
         so the endpoint here is "reviews", NOT "admin/reviews". */
      const qs = onlyLowUnacked ? '?max_stars=2&acked=0' : '';
      const data = await adminApi.get(`reviews${qs}`);
      setReviews(data.reviews);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onlyLowUnacked]);

  useEffect(() => { void load(); }, [load]);

  async function ack(id: number) {
    await adminApi.post(`reviews/ack/${id}`, {});
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-brand-900">Reviews</h1>
        <label className="flex items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={onlyLowUnacked}
            onChange={(e) => setOnlyLowUnacked(e.target.checked)}
          />
          Needs follow-up
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-brand-500">Loading…</p>}
      {!loading && reviews.length === 0 && (
        <p className="text-sm text-brand-500">
          {onlyLowUnacked ? 'Nothing needs following up. ' : 'No reviews yet.'}
        </p>
      )}

      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border border-cream-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars n={r.stars} />
              <span className="text-sm font-medium text-brand-900">{r.name}</span>
              <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-sm text-brand-600">
                <Phone className="h-3.5 w-3.5" /> {r.phone}
              </a>
              <span className="text-xs text-brand-400">
                #{r.order_id} · {new Date(r.created_at).toLocaleString()}
              </span>
            </div>

            {/* Customer-typed text. React escapes it; never reach for
                dangerouslySetInnerHTML here. */}
            {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-brand-800">{r.comment}</p>}

            {r.dishes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {r.dishes.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-brand-600">
                    <Stars n={d.stars} /> {d.item_name}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3">
              {r.acked_at ? (
                <span className="flex items-center gap-1 text-xs text-brand-500">
                  <Check className="h-3.5 w-3.5" /> Followed up by {r.acked_label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void ack(r.id)}
                  className="rounded-lg border border-cream-200 px-3 py-1.5 text-xs font-medium text-brand-800"
                >
                  Mark followed up
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Read `web/src/apps/admin/pages/Customers.tsx` first and match its client import (`adminApi` versus a differently named export) and list styling.

- [ ] **Step 2: Wire the route**

In `web/src/apps/admin/AdminArea.tsx`, import `AdminReviews` and add inside the guarded layout block:

```tsx
<Route path="reviews" element={<RequireCap cap="reviews"><AdminReviews /></RequireCap>} />
```

- [ ] **Step 3: Add the nav item**

In `web/src/apps/admin/layout/AdminLayout.tsx`, import `MessageSquare` from `lucide-react` and add to `NAV`, after Customers:

```tsx
{ to: '/admin/reviews', label: 'Reviews', icon: MessageSquare, cap: 'reviews' },
```

- [ ] **Step 4: Add the dashboard tile**

In `web/src/apps/admin/pages/Dashboard.tsx`, render `low_reviews_unacked` from the dashboard payload as a tile linking to `/admin/reviews`, matching the existing tiles' markup. Read the file and copy the surrounding tile component rather than inventing one.

- [ ] **Step 5: Type-check and build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no errors. A `reviews` cap missing from `rbac.ts` shows up here as a type error, which is the point of the mirror being typed.

- [ ] **Step 6: Check it in the browser**

Sign in as an admin, submit a 1-star review through `/rate/<token>`, then open `/admin/reviews`.
Expected: the review appears under the default "Needs follow-up" filter, the comment renders as plain text (submit `<b>test</b>` and confirm it shows the tags rather than bold text), "Mark followed up" records your username, and the dashboard tile count drops by one.

- [ ] **Step 7: Commit**

```bash
git add web/src/apps/admin/pages/Reviews.tsx web/src/apps/admin/AdminArea.tsx web/src/apps/admin/layout/AdminLayout.tsx web/src/apps/admin/pages/Dashboard.tsx
git commit -m "feat(reviews): admin reviews screen with follow-up tracking"
```

---

### Task 11: Documentation and the cron handover

**Files:**
- Modify: `README.md` (a "Reviews" section under the existing deployment/operations notes)
- Create: `docs/superpowers/plans/2026-09-10-ratings-reviews-phase1-verification.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the operator instructions for the one step this repo cannot perform.

- [ ] **Step 1: Run every verification script in one pass**

Run:
```bash
php scripts/verify-review-schema.php
php scripts/verify-review-due.php
php scripts/verify-review-tokens.php
php scripts/verify-review-validation.php
php scripts/verify-review-sweep.php
php scripts/verify-cumulative-migration.php
php scripts/verify-install-file.php
cd web && node scripts/verify-rate-lines.mjs && npx tsc --noEmit && npm run build
```
Expected: every one exits 0. Record the actual pass counts — do not write them from memory.

- [ ] **Step 2: Write the verification record**

Create `docs/superpowers/plans/2026-09-10-ratings-reviews-phase1-verification.md` listing each command above with its real output summary, plus the manual checks performed and their results. Where something was NOT exercised (for example, the cron job on the live host), say so plainly rather than leaving it implied.

- [ ] **Step 3: Document the cron job in `README.md`**

```markdown
### Review prompts (cron)

`scripts/send-review-prompts.php` sends the "how was your meal?" push. It is the
only scheduled job in the project, and **nothing works without it**: the rule
"60 minutes after the scheduled time when delivery was never marked" has no
other trigger.

Set it up once in Hostinger hPanel → Advanced → Cron Jobs:

- **Schedule:** every 5 minutes (`*/5 * * * *`)
- **Command:**
  `/usr/bin/php /home/<user>/domains/vaatsalyakitchens.in/scripts/send-review-prompts.php`

Add `--verbose` while testing to see what it picked up. It takes a MySQL
advisory lock, so overlapping runs are safe — a second copy exits immediately.

Orders created before the `reviews_since` setting (written when migration 013
ran) are never prompted, so enabling the cron cannot message customers about old
meals.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-09-10-ratings-reviews-phase1-verification.md
git commit -m "docs(reviews): cron setup and phase 1 verification record"
```

---

## Operator steps this plan cannot perform

These are **not** optional, and none of them can be done from this repository:

1. **Run migration 013 on production.** Salil runs migrations himself.
2. **Create the cron job in Hostinger hPanel** (Task 11, Step 3). Without it there is no prompt at all — no push, and the 60-minute fallback never fires.
3. **Build and install a new APK.** The counter phones run a packaged build with its own copy of the JavaScript; `/rate/:token` will not exist for them until they are updated.
4. **Confirm on a real device** that the prompt push arrives and the rating page submits from inside the app.

# Discount codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zomato-style discount codes: one admin number ("discount budget, % of sales") generates three codes; customers apply one at checkout; counter reps can combine a code with the manual discount up to a 24 % ceiling; an admin Discounts page shows the codes and their usage.

**Architecture:** Migration 016 adds `discount_codes` and three order columns (`discount_code`, `code_pct`, `code_amount`). A pure engine in `includes/discounts.php` (`discount_plan`, `discount_regenerate`, `discount_check`, `discount_combined_ok`) is the single authority, used by a public `/api/discounts` route, both order-create paths and the admin route. Billing reuses `compute_order_total` — the code just supplies a percentage. The client mirrors only the display/meter maths in `web/src/apps/shared/lib/discounts.ts`.

**Tech Stack:** PHP 8.2 / MariaDB (XAMPP: `C:/xampp/php/php.exe`, `C:/xampp/mysql/bin/mysql.exe -u root`, DB `vaatsalya_kitchens`), React 18 + TypeScript + Vite + Tailwind, `scripts/verify-*.php` (throwaway DBs), `web/scripts/verify-*.mjs` (esbuild transform), Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-09-12-discount-codes-design.md`

## Global Constraints

- `DISCOUNT_CEILING_PCT = 24.0`. No single code exceeds 24 %; a code plus the manual counter discount must not exceed 24 % of the pre-tax subtotal — server refuses with 422 `Discount (X %) + code (Y %) exceeds the 24 % ceiling.`; the counter meter reads `Total discount N % of 24 % max`, normal ≤ 18 %, amber over 18 %, red over 24 % with Save disabled and the text `Over the 24 % ceiling — reduce the manual discount or remove the code.`
- Plan table (B = budget %, A = average order ₹, percentages rounded to whole numbers; a budget of 0 → empty plan):

  | kind | code | pct | max_amount | min_order | first_order_only |
  |---|---|---|---|---|---|
  | first | `WELCOME` | min(round(1.5·B), 24) | 100 | 0 | 1 |
  | flat | `VK<round B>` | round(B) | 150 | round(A/50)·50 | 0 |
  | big | `FEAST` | min(round(B)+5, 24) | 300 | round(2A/50)·50 | 0 |

  A = average `subtotal` of `delivered` orders in the last 30 days, or ₹400 when fewer than 10 such orders exist.
- `discount_check` messages (exact): `That code isn't valid.` / `Add ₹X more to use CODE.` / `CODE is for your first order only.` / `Enter your phone number to use CODE.` Amount = `min(round(subtotal·pct/100, 2), max_amount)`; the effective pct stored is `round(amount/subtotal·100, 2)` so `compute_order_total` reproduces the rupee figure.
- "First order" = no order for that phone with `status <> 'cancelled'` exists yet (the current order is not inserted when the check runs).
- On an order: `discount_pct`/`discount_amount` remain the TOTAL discount; `code_pct`/`code_amount` are the code's share; `discount_code` the text. Complimentary orders ignore codes.
- Codes are never deleted; regeneration deactivates (`active = 0`) rows not in the new plan and updates in place a code whose text matches. Renamed codes: `^[A-Z0-9]{3,12}$`, unique.
- Settings key `discount_budget_pct`, default `'0'` (feature off — `GET /api/discounts` returns an empty list and checkout shows no Offers card). It is owned by `api/routes/admin/discounts.php`; `admin/settings.php` must ignore it.
- New admin cap `discounts` for roles `super` and `admin` (PHP `includes/admin_roles.php` AND `web/src/apps/admin/rbac.ts`).
- Public discount endpoints are rate-limited with the existing `too_many_attempts('code:' . $ip, 30, 15)` / `record_attempt` helpers.
- Migration lands in three places (`database/migration_016_discount_codes.sql`, guarded block + verification rows in `database/migrate_production.sql`, `database/install_fresh.sql`); `scripts/verify-cumulative-migration.php` and `scripts/verify-install-file.php` pass.
- Never compare a `?` placeholder to a string literal in SQL (production collation differs).
- Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/discount-codes` off `main`. Files are CRLF — use the Edit tool for existing files.

---

## File map

| File | Responsibility |
|---|---|
| `database/migration_016_discount_codes.sql` (+ cumulative, install) | table + order columns |
| `includes/settings.php` | `discount_budget_pct` default |
| `includes/admin_roles.php`, `web/src/apps/admin/rbac.ts` | `discounts` cap |
| `includes/discounts.php` (new) | the engine |
| `scripts/verify-discounts.php` (new) | proof of the engine on a throwaway DB |
| `api/routes/discounts.php` (new) | public `GET /api/discounts`, `POST /api/discounts/check` |
| `api/routes/orders.php` | customer create applies a code; `index`/`show` return code fields |
| `api/routes/admin/orders.php` | counter create/update accept a code, enforce the ceiling; list/show return code fields |
| `api/routes/admin/discounts.php` (new) | list / budget / regenerate / rename / active |
| `api/routes/admin/settings.php` | ignores `discount_budget_pct` |
| `web/src/apps/shared/lib/discounts.ts` (new), `web/scripts/verify-discount-meter.mjs` (new) | meter maths |
| `web/src/apps/shared/types/index.ts`, `web/src/apps/shared/api/endpoints.ts` | `DiscountOffer`, `discountsApi`, order fields |
| `web/src/apps/storefront/components/OffersCard.tsx` (new), `BillDetails.tsx`, `pages/Checkout.tsx` | customer side |
| `web/src/apps/admin/pages/NewOrder.tsx`, `api/endpoints.ts`, `types.ts` | counter code + meter |
| `web/src/apps/admin/pages/Discounts.tsx` (new), `AdminArea.tsx`, `layout/AdminLayout.tsx` | admin page |
| `web/src/apps/shared/lib/receiptText.ts` | code name on the receipt's discount line |
| `README.md` | Discounts section + deploy step |

---

### Task 1: Migration 016, setting default, `discounts` cap

**Files:**
- Create: `database/migration_016_discount_codes.sql`
- Modify: `database/migrate_production.sql` (after the migration_015 block; + 4 verification rows), `database/install_fresh.sql` (CREATE TABLE next to the other tables; guarded ALTERs next to the `variant_ids` one; + verification rows)
- Modify: `includes/settings.php:17-56` (`discount_budget_pct` default), `includes/admin_roles.php:50-51`, `web/src/apps/admin/rbac.ts:10-20,34-35`

**Interfaces:**
- Produces: table `discount_codes`; columns `orders.discount_code VARCHAR(20) NULL`, `orders.code_pct DECIMAL(5,2) NOT NULL DEFAULT 0`, `orders.code_amount DECIMAL(10,2) NOT NULL DEFAULT 0`; `setting('discount_budget_pct')` defaulting to `'0'`; cap `discounts` on `super`/`admin`.

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/discount-codes main
```

- [ ] **Step 2: Numbered migration**

`database/migration_016_discount_codes.sql`:

```sql
-- migration_016_discount_codes.sql — discount codes (customer side).
--
-- The admin sets one number (discount_budget_pct); includes/discounts.php
-- derives three codes from it. Codes are never deleted (orders name them by
-- text) — regeneration deactivates the old rows. On an order, discount_pct /
-- discount_amount stay the TOTAL discount; code_pct / code_amount say how much
-- of it the code contributed (the rest is the counter's manual %).

CREATE TABLE IF NOT EXISTS discount_codes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(20)  NOT NULL,
  kind             ENUM('first','flat','big') NOT NULL,
  pct              DECIMAL(5,2) NOT NULL,
  max_amount       DECIMAL(10,2) NOT NULL,
  min_order        DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1)   NOT NULL DEFAULT 0,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discount_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE orders ADD COLUMN discount_code VARCHAR(20) NULL AFTER discount_pct;
ALTER TABLE orders ADD COLUMN code_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER discount_code;
ALTER TABLE orders ADD COLUMN code_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER code_pct;
```

- [ ] **Step 3: Cumulative file**

After the migration_015 block in `migrate_production.sql`:

```sql


-- --- migration_016: discount codes -------------------------------------------
CREATE TABLE IF NOT EXISTS discount_codes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(20)  NOT NULL,
  kind             ENUM('first','flat','big') NOT NULL,
  pct              DECIMAL(5,2) NOT NULL,
  max_amount       DECIMAL(10,2) NOT NULL,
  min_order        DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1)   NOT NULL DEFAULT 0,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discount_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN discount_code VARCHAR(20) NULL AFTER discount_pct')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_code');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN code_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER discount_code')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='code_pct');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE orders ADD COLUMN code_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER code_pct')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='code_amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
```

Verification rows appended to the final SELECT (move the `;`):

```sql
UNION ALL SELECT 'discount_codes', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='discount_codes'
UNION ALL SELECT 'orders.discount_code', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='discount_code'
UNION ALL SELECT 'orders.code_pct', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='code_pct'
UNION ALL SELECT 'orders.code_amount', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='code_amount';
```

`install_fresh.sql`: the same CREATE TABLE (placed after the `menu_item_addons` CREATE), the three guarded ALTERs after the `variant_ids` guarded block, the same four verification rows.

- [ ] **Step 4: Setting default and cap**

`includes/settings.php` — after `google_place_id`:

```php
        /* Discount budget, percent of sales the kitchen is willing to give
           away. includes/discounts.php turns it into codes; "0" = no codes.
           Owned by api/routes/admin/discounts.php, not the Settings page. */
        'discount_budget_pct'  => '0',
```

`includes/admin_roles.php:50-51` — append `'discounts'` to the `super` and `admin` arrays. `web/src/apps/admin/rbac.ts` — add `| 'discounts'` to `AdminCap` and append `'discounts'` to `super` and `admin` in `CAPS_BY_ROLE`.

- [ ] **Step 5: Verify and apply locally**

```bash
C:/xampp/php/php.exe scripts/verify-cumulative-migration.php
C:/xampp/php/php.exe scripts/verify-install-file.php
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens < database/migration_016_discount_codes.sql
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens -e "SHOW COLUMNS FROM orders LIKE 'code_%'; SHOW TABLES LIKE 'discount_codes'"
cd web && npx tsc --noEmit -p . && cd ..
```

- [ ] **Step 6: Commit**

```bash
git add database includes/settings.php includes/admin_roles.php web/src/apps/admin/rbac.ts
git commit -m "feat(db): migration 016 — discount codes, order code columns, discounts cap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The engine — `includes/discounts.php`

**Files:**
- Create: `includes/discounts.php`, `scripts/verify-discounts.php`

**Interfaces:**
- Produces:
  ```php
  const DISCOUNT_CEILING_PCT = 24.0;
  class DiscountError extends RuntimeException {}
  function discount_plan(float $budgetPct, float $avgOrder): array   // list of ['code','kind','pct','max_amount','min_order','first_order_only']
  function discount_average_order(PDO $pdo): float                    // 30-day delivered average subtotal, or 400.0
  function discount_regenerate(PDO $pdo, float $budgetPct): array     // applies the plan; returns the active rows
  function discount_active(PDO $pdo): array                           // active rows, ordered by kind first/flat/big
  function discount_check(PDO $pdo, string $code, float $subtotal, ?string $phone): array  // ['code','pct','amount','max_amount','min_order'] or throws DiscountError
  function discount_combined_ok(float $codePct, float $manualPct): bool
  ```
  Rows from the DB are returned with numeric fields cast (`pct`, `max_amount`, `min_order` as float; `first_order_only`, `active` as bool; `id` int).

- [ ] **Step 1: Failing verification script**

`scripts/verify-discounts.php`:

```php
<?php
/* The discount engine end to end on a throwaway database: the plan derived
   from one budget number, regeneration that deactivates rather than deletes,
   and every refusal message a customer can see. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
require 'includes/discounts.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}
function refused(callable $fn): ?string {
    try { $fn(); return null; } catch (DiscountError $e) { return $e->getMessage(); }
}
$row = fn(array $plan, string $kind) => array_values(array_filter($plan, fn($r) => $r['kind'] === $kind))[0] ?? null;

echo "discount_plan\n";
check('budget 0 → no codes', [], discount_plan(0, 400));
$p = discount_plan(10, 400);
check('three codes', ['WELCOME', 'VK10', 'FEAST'], array_column($p, 'code'));
check('WELCOME 15 % cap 100 first-order', [15.0, 100.0, 0.0, true],
    [$row($p, 'first')['pct'], $row($p, 'first')['max_amount'], $row($p, 'first')['min_order'], $row($p, 'first')['first_order_only']]);
check('VK10 10 % min 400 cap 150', [10.0, 150.0, 400.0, false],
    [$row($p, 'flat')['pct'], $row($p, 'flat')['max_amount'], $row($p, 'flat')['min_order'], $row($p, 'flat')['first_order_only']]);
check('FEAST 15 % min 800 cap 300', [15.0, 300.0, 800.0], [$row($p, 'big')['pct'], $row($p, 'big')['max_amount'], $row($p, 'big')['min_order']]);
$p = discount_plan(20, 430);
check('WELCOME capped at 24', 24.0, $row($p, 'first')['pct']);
check('FEAST capped at 24', 24.0, $row($p, 'big')['pct']);
check('min orders snap to ₹50', [450.0, 850.0], [$row($p, 'flat')['min_order'], $row($p, 'big')['min_order']]);
check('code text from rounded budget', 'VK13', $row(discount_plan(12.6, 400), 'flat')['code']);
check('a budget above 24 is itself capped', 24.0, $row(discount_plan(30, 400), 'flat')['pct']);

echo "\ndiscount_combined_ok\n";
check('23.99 ok', true,  discount_combined_ok(10, 13.99));
check('24 ok',    true,  discount_combined_ok(12, 12));
check('24.01 no', false, discount_combined_ok(12, 12.01));

$pdo = db();
$dbName = 'vk_verify_discounts_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE discount_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(20) NOT NULL, kind ENUM('first','flat','big') NOT NULL,
  pct DECIMAL(5,2) NOT NULL, max_amount DECIMAL(10,2) NOT NULL, min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_discount_code (code))");
$pdo->exec("CREATE TABLE orders (id INT UNSIGNED NOT NULL AUTO_INCREMENT, phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id))");

try {
    echo "\ndiscount_average_order\n";
    check('fewer than 10 delivered → 400', 400.0, discount_average_order($pdo));
    for ($i = 0; $i < 10; $i++) {
        $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000001', 'delivered', 500)");
    }
    $pdo->exec("INSERT INTO orders (phone, status, subtotal, created_at) VALUES ('919000000001', 'delivered', 5000, NOW() - INTERVAL 40 DAY)");
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000001', 'cancelled', 5000)");
    check('30-day delivered average, cancelled and old ignored', 500.0, discount_average_order($pdo));

    echo "\ndiscount_regenerate\n";
    $active = discount_regenerate($pdo, 10);
    check('three active', ['WELCOME', 'VK10', 'FEAST'], array_column($active, 'code'));
    $vk10Id = (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'VK10'")->fetchColumn();
    $active = discount_regenerate($pdo, 12);
    check('VK10 deactivated, VK12 added', ['WELCOME', 'VK12', 'FEAST'], array_column($active, 'code'));
    check('VK10 row kept, inactive', '0', (string)$pdo->query("SELECT active FROM discount_codes WHERE code = 'VK10'")->fetchColumn());
    check('WELCOME keeps its id across regenerations', 1, (int)$pdo->query("SELECT COUNT(*) FROM discount_codes WHERE code = 'WELCOME'")->fetchColumn());
    $active = discount_regenerate($pdo, 10);
    check('VK10 reactivated in place', $vk10Id, (int)$pdo->query("SELECT id FROM discount_codes WHERE code = 'VK10' AND active = 1")->fetchColumn());
    check('budget 0 deactivates everything', [], discount_regenerate($pdo, 0));
    discount_regenerate($pdo, 10);

    echo "\ndiscount_check\n";
    check('unknown', "That code isn't valid.", refused(fn() => discount_check($pdo, 'NOPE', 1000, '919000000002')));
    check('inactive', "That code isn't valid.", refused(fn() => discount_check($pdo, 'VK12', 1000, '919000000002')));
    check('case-insensitive, trimmed', 'VK10', discount_check($pdo, ' vk10 ', 1000, null)['code']);
    check('below floor', 'Add ₹50 more to use VK10.', refused(fn() => discount_check($pdo, 'VK10', 350, null)));
    check('flat: 10 % of 1000', 100.0, discount_check($pdo, 'VK10', 1000, null)['amount']);
    check('flat: capped at 150', 150.0, discount_check($pdo, 'VK10', 2000, null)['amount']);
    check('effective pct after cap', 7.5, discount_check($pdo, 'VK10', 2000, null)['pct']);
    check('first-order without phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo, 'WELCOME', 500, null)));
    check('first-order: phone with delivered orders', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo, 'WELCOME', 500, '919000000001')));
    check('first-order: new phone ok', 75.0, discount_check($pdo, 'WELCOME', 500, '919000000002')['amount']);
    $pdo->exec("INSERT INTO orders (phone, status, subtotal) VALUES ('919000000003', 'cancelled', 300)");
    check('first-order: only a cancelled order before → still first', 75.0, discount_check($pdo, 'WELCOME', 500, '919000000003')['amount']);
    check('big: below its floor', 'Add ₹300 more to use FEAST.', refused(fn() => discount_check($pdo, 'FEAST', 500, null)));
    check('big: 15 % of 800 = 120', 120.0, discount_check($pdo, 'FEAST', 800, null)['amount']);
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run** → fatal (file missing).

- [ ] **Step 3: Implement `includes/discounts.php`**

```php
<?php
/* Discount codes. One number from the admin — the share of sales the kitchen
   will give away — becomes three codes; this file is the only place that
   decides what a code is worth. Both order routes and the admin route call
   in here; nothing else touches discount_codes.

   The 24 % ceiling applies twice: no single code exceeds it, and at the
   counter a code plus the manual discount may not exceed it either. */

const DISCOUNT_CEILING_PCT = 24.0;

class DiscountError extends RuntimeException {}

/** The three codes for budget B (percent) and average order A (rupees). */
function discount_plan(float $budgetPct, float $avgOrder): array
{
    $b = (int)round(min(max($budgetPct, 0.0), DISCOUNT_CEILING_PCT));
    if ($b <= 0) {
        return [];
    }
    $snap = fn(float $rupees) => (float)(round($rupees / 50) * 50);
    return [
        ['code' => 'WELCOME',  'kind' => 'first', 'pct' => (float)min((int)round(1.5 * $b), 24), 'max_amount' => 100.0, 'min_order' => 0.0,             'first_order_only' => true],
        ['code' => "VK$b",     'kind' => 'flat',  'pct' => (float)$b,                             'max_amount' => 150.0, 'min_order' => $snap($avgOrder),  'first_order_only' => false],
        ['code' => 'FEAST',    'kind' => 'big',   'pct' => (float)min($b + 5, 24),                'max_amount' => 300.0, 'min_order' => $snap(2 * $avgOrder), 'first_order_only' => false],
    ];
}

/** Average pre-tax subtotal of delivered orders in the last 30 days; ₹400 until there are ten. */
function discount_average_order(PDO $pdo): float
{
    $row = $pdo->query(
        "SELECT COUNT(*) AS n, AVG(subtotal) AS a FROM orders
          WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL 30 DAY"
    )->fetch();
    return (int)$row['n'] >= 10 ? round((float)$row['a'], 2) : 400.0;
}

function discount_row(array $r): array
{
    return [
        'id'               => (int)$r['id'],
        'code'             => $r['code'],
        'kind'             => $r['kind'],
        'pct'              => (float)$r['pct'],
        'max_amount'       => (float)$r['max_amount'],
        'min_order'        => (float)$r['min_order'],
        'first_order_only' => (int)$r['first_order_only'] === 1,
        'active'           => (int)$r['active'] === 1,
        'created_at'       => $r['created_at'],
    ];
}

/** Active codes in the order first / flat / big. */
function discount_active(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT * FROM discount_codes WHERE active = 1 ORDER BY FIELD(kind, 'first', 'flat', 'big'), id"
    )->fetchAll();
    return array_map('discount_row', $rows);
}

/**
 * Apply the plan for a budget: every active row not in the plan is switched
 * off, a row whose code text matches is updated in place (keeps its id and
 * any usage history), the rest are inserted. Returns the active rows.
 */
function discount_regenerate(PDO $pdo, float $budgetPct): array
{
    $plan = discount_plan($budgetPct, discount_average_order($pdo));
    $codes = array_column($plan, 'code');

    $pdo->beginTransaction();
    try {
        $pdo->exec('UPDATE discount_codes SET active = 0');
        $upd = $pdo->prepare(
            'UPDATE discount_codes SET kind = ?, pct = ?, max_amount = ?, min_order = ?, first_order_only = ?, active = 1 WHERE code = ?'
        );
        $ins = $pdo->prepare(
            'INSERT INTO discount_codes (code, kind, pct, max_amount, min_order, first_order_only, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
        );
        foreach ($plan as $p) {
            $upd->execute([$p['kind'], $p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0, $p['code']]);
            if ($upd->rowCount() === 0) {
                $exists = $pdo->prepare('SELECT COUNT(*) FROM discount_codes WHERE code = ?');
                $exists->execute([$p['code']]);
                if ((int)$exists->fetchColumn() === 0) {
                    $ins->execute([$p['code'], $p['kind'], $p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0]);
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    unset($codes);
    return discount_active($pdo);
}

/**
 * What a code is worth for this cart. Throws DiscountError with the exact
 * sentence the customer sees. The phone is needed only for first-order codes.
 */
function discount_check(PDO $pdo, string $code, float $subtotal, ?string $phone): array
{
    $code = strtoupper(trim($code));
    $stmt = $pdo->prepare('SELECT * FROM discount_codes WHERE code = ? AND active = 1');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new DiscountError("That code isn't valid.");
    }
    $row = discount_row($row);
    $subtotal = round(max(0.0, $subtotal), 2);

    if ($subtotal < $row['min_order']) {
        $more = (int)ceil($row['min_order'] - $subtotal);
        throw new DiscountError("Add ₹$more more to use {$row['code']}.");
    }
    if ($row['first_order_only']) {
        if ($phone === null || $phone === '') {
            throw new DiscountError("Enter your phone number to use {$row['code']}.");
        }
        $prev = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE phone = ? AND status <> 'cancelled'");
        $prev->execute([$phone]);
        if ((int)$prev->fetchColumn() > 0) {
            throw new DiscountError("{$row['code']} is for your first order only.");
        }
    }
    $amount = min(round($subtotal * $row['pct'] / 100.0, 2), $row['max_amount']);
    $pct = $subtotal > 0 ? round($amount / $subtotal * 100.0, 2) : 0.0;
    return [
        'code'       => $row['code'],
        'pct'        => $pct,
        'amount'     => $amount,
        'max_amount' => $row['max_amount'],
        'min_order'  => $row['min_order'],
    ];
}

/** The counter ceiling: code plus manual discount, in one place. */
function discount_combined_ok(float $codePct, float $manualPct): bool
{
    return round($codePct + $manualPct, 2) <= DISCOUNT_CEILING_PCT;
}
```

(Note `WHERE status = 'delivered'` and `status <> 'cancelled'` compare a column to a literal — allowed; the collation rule forbids `? = 'literal'`.)

- [ ] **Step 4: Run** → `36 passed, 0 failed` (count the checks; report the real number).

- [ ] **Step 5: Commit**

```bash
git add includes/discounts.php scripts/verify-discounts.php
git commit -m "feat(discounts): the engine — plan from one budget number, check, regenerate

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Public route + customer order create

**Files:**
- Create: `api/routes/discounts.php`
- Modify: `api/routes/orders.php` (create ~lines 160-215; `index` ~245 and `show` ~354 SELECTs and casts)

**Interfaces:**
- Produces: `GET /api/discounts` → `{codes: [{code, pct, max_amount, min_order, first_order_only}]}` (empty when budget is 0); `POST /api/discounts/check {code, subtotal, phone}` → `{code, pct, amount}` or 422 `{error}`. Customer `POST /api/orders/create` accepts `discount_code`; `orders/index` and `orders/show` rows carry `discount_code: string|null`, `code_pct: number`, `code_amount: number`.

- [ ] **Step 1: The route**

`api/routes/discounts.php`:

```php
<?php
/* GET  /api/discounts        — the active codes, for the "offers" chips.
   POST /api/discounts/check  {code, subtotal, phone} — what a code is worth
                               for this cart, or the reason it is not.
   Public. Rate-limited per IP so a script cannot enumerate codes. */
require_once __DIR__ . '/../../includes/discounts.php';
require_once __DIR__ . '/../../includes/settings.php';

function route($method, $action, $parts): void
{
    if ($action === 'index' && $method === 'GET') {
        $codes = array_map(fn($r) => [
            'code'             => $r['code'],
            'pct'              => $r['pct'],
            'max_amount'       => $r['max_amount'],
            'min_order'        => $r['min_order'],
            'first_order_only' => $r['first_order_only'],
        ], discount_active(db()));
        Response::json(['codes' => $codes]);
    }

    if ($action === 'check' && $method === 'POST') {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if (too_many_attempts('code:' . $ip, 30, 15)) {
            Response::error('Too many tries. Please wait a few minutes.', 429);
        }
        record_attempt('code:' . $ip);
        $code     = (string)($_POST['code'] ?? '');
        $subtotal = (float)($_POST['subtotal'] ?? 0);
        $phone    = normalize_phone((string)($_POST['phone'] ?? ''));
        try {
            $r = discount_check(db(), $code, $subtotal, $phone);
        } catch (DiscountError $e) {
            Response::error($e->getMessage(), 422);
        }
        Response::json(['code' => $r['code'], 'pct' => $r['pct'], 'amount' => $r['amount']]);
    }

    Response::error('Not found', 404);
}
```

Check `includes/helpers.php` for the phone normaliser's real name (`normalize_phone` or similar — grep `function normalize`); it must return `null`/`''` for blank input. `$_POST` is populated from JSON by `api/index.php` (confirm by reading how other routes read `$_POST`).

- [ ] **Step 2: Customer create**

In `api/routes/orders.php` create, after the minimum-order check and before `$gst = compute_gst(...)` (line ~171): require `includes/discounts.php` at the top, then

```php
        /* A discount code, re-checked here with the recomputed subtotal and
           the posted phone — the client's figure is never trusted. */
        $codeRow = null;
        $codeText = trim((string)($_POST['discount_code'] ?? ''));
        if ($codeText !== '') {
            try {
                $codeRow = discount_check($pdo, $codeText, $total, $phone);
            } catch (DiscountError $e) {
                Response::error($e->getMessage(), 422);
            }
        }
        $gst = compute_order_total($total, (float)setting('gst_rate', '0'), $codeRow['pct'] ?? 0.0);
```

(`compute_order_total` returns the same keys `compute_gst` did plus `discount_pct`/`discount_amount`; `$gst['total']` etc. keep working.) Extend the INSERT with `discount_pct, discount_amount, discount_code, code_pct, code_amount` bound to `$gst['discount_pct'], $gst['discount_amount'], $codeRow['code'] ?? null, $gst['discount_pct'], $gst['discount_amount']`. Add `'code' => $codeRow['code'] ?? null` to the `created` event detail.

- [ ] **Step 3: `index` and `show`**

Add `o.discount_code, o.code_pct, o.code_amount` to both SELECTs and cast `code_pct`/`code_amount` to float next to the existing `discount_pct` casts.

- [ ] **Step 4: Smoke**

With the local API running (`C:/xampp/php/php.exe -S 127.0.0.1:8000 -t . api/index.php` from the repo root, or whatever `.claude/launch.json` uses), set a budget directly for the test: `C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens -e "INSERT INTO settings (\`key\`, value) VALUES ('discount_budget_pct','10') ON DUPLICATE KEY UPDATE value='10'"` then `C:/xampp/php/php.exe -r "chdir('.'); require 'includes/db.php'; require 'includes/discounts.php'; print_r(discount_regenerate(db(), 10));"`.

```bash
curl -s http://127.0.0.1:8000/api/discounts
curl -s -X POST http://127.0.0.1:8000/api/discounts/check -H 'Content-Type: application/json' -d '{"code":"vk10","subtotal":1000,"phone":""}'
curl -s -X POST http://127.0.0.1:8000/api/discounts/check -H 'Content-Type: application/json' -d '{"code":"WELCOME","subtotal":500,"phone":"9876543210"}'
```

Expected: three codes; `{"code":"VK10","pct":10,"amount":100}`; either the WELCOME amount or the first-order refusal depending on that phone's history. Then place one order with `discount_code: "VK10"` and enough items (ids from `/api/menu`), confirm `SELECT discount_pct, discount_amount, discount_code, code_pct, code_amount, total_estimate FROM orders ORDER BY id DESC LIMIT 1`, and delete only that order by id (`order_events`, `order_items`, `orders`). Leave the budget at 10 locally (later tasks use it).

- [ ] **Step 5: Commit**

```bash
git add api/routes/discounts.php api/routes/orders.php
git commit -m "feat(api): public discount codes; customer orders apply a code before GST

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Counter — code + ceiling in `admin/orders.php`

**Files:**
- Modify: `api/routes/admin/orders.php` (create ~405-460, update ~521-548, list ~89 and show ~186 SELECTs + casts)

**Interfaces:**
- Produces: `POST admin/orders/create` and `update` accept `discount_code` (string, optional); refuse 422 `Discount (X %) + code (Y %) exceeds the 24 % ceiling.` when `discount_combined_ok` is false; complimentary orders ignore the code. Rows carry `discount_code`, `code_pct`, `code_amount`.

- [ ] **Step 1: A shared helper inside the file**

Above `route()` in `admin/orders.php` (require `includes/discounts.php` at the top):

```php
/* The counter's discount: a code (re-checked against this subtotal and the
   customer's phone) plus the manual percentage, refused past the ceiling.
   Returns [$combinedPct, $codeRow|null]. Complimentary orders carry no code. */
function counter_discount(PDO $pdo, float $subtotal, string $phone, float $manualPct, bool $isComplimentary): array
{
    $codeText = trim((string)($_POST['discount_code'] ?? ''));
    if ($codeText === '' || $isComplimentary) {
        return [$manualPct, null];
    }
    try {
        $codeRow = discount_check($pdo, $codeText, $subtotal, $phone);
    } catch (DiscountError $e) {
        Response::error($e->getMessage(), 422);
    }
    if (!discount_combined_ok($codeRow['pct'], $manualPct)) {
        $m = rtrim(rtrim(number_format($manualPct, 2, '.', ''), '0'), '.');
        $c = rtrim(rtrim(number_format($codeRow['pct'], 2, '.', ''), '0'), '.');
        Response::error("Discount ($m %) + code ($c %) exceeds the " . (int)DISCOUNT_CEILING_PCT . " % ceiling.", 422);
    }
    return [round($manualPct + $codeRow['pct'], 2), $codeRow];
}
```

- [ ] **Step 2: create and update**

In both, after `resolve_order_lines` and before `compute_order_total`: `[$discountPct, $codeRow] = counter_discount($pdo, $total /* or $subtotal */, $phone, $discountPct, $isComplimentary);`. Extend the INSERT/UPDATE with `discount_code, code_pct, code_amount` = `$codeRow['code'] ?? null`, `$codeRow['pct'] ?? 0`, `$codeRow ? min(round($bill['subtotal'] * $codeRow['pct'] / 100, 2), $codeRow['max_amount']) : 0`. Add `'code' => $codeRow['code'] ?? null` to the create event detail; in update's `$changed` list add `['discount_code', $codeRow['code'] ?? null]` if the file compares against the previous row (read how `$changed` is built and follow it).

- [ ] **Step 3: list/show**

Add `o.discount_code, o.code_pct, o.code_amount` to the list and show SELECTs; cast the two numbers to float alongside `discount_pct`.

- [ ] **Step 4: Verify**

`C:/xampp/php/php.exe -l api/routes/admin/orders.php`. Then `scripts/verify-order-discount.php` (new, throwaway DB is overkill here — instead a focused script that calls `discount_combined_ok` pairs and `counter_discount` is HTTP-bound). Do this instead: a curl smoke with an admin bearer token minted for the local super admin (read `includes/auth_tokens.php` for the mint function name; mint with `C:/xampp/php/php.exe -r` for subject type `admin`, the local admin's id, label `verify`; DELETE only that token row afterwards by its id). Post `admin/orders/create` with `discount_pct: 12, discount_code: "VK10"` (passes), then `discount_pct: 15, discount_code: "VK10"` (422 with the ceiling text), then `is_complimentary: true, discount_code: "VK10"` (passes, no code stored). Delete the test orders by exact id.

- [ ] **Step 5: Commit**

```bash
git add api/routes/admin/orders.php
git commit -m "feat(counter): discount codes at the till, capped with the manual discount at 24 %

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin discounts route

**Files:**
- Create: `api/routes/admin/discounts.php`
- Modify: `api/routes/admin/settings.php` (ignore `discount_budget_pct` on update — find the allowlist of keys it accepts and confirm the key is simply not in it; add a comment)

**Interfaces:**
- Produces (cap `discounts`):
  - `GET admin/discounts` → `{budget_pct: number, average_order: number, codes: [{id, code, kind, pct, max_amount, min_order, first_order_only, active, created_at, uses: number, given: number}]}` (all rows, active first; `uses` = orders with `discount_code = code` and `status <> 'cancelled'`, `given` = SUM(code_amount) of those).
  - `POST admin/discounts/budget {pct}` → regenerates; returns the same payload as GET. `pct` clamped 0–24, stored via `set_setting('discount_budget_pct', ...)`.
  - `POST admin/discounts/regenerate` → same as budget with the stored value.
  - `POST admin/discounts/rename/{id} {code}` → `^[A-Z0-9]{3,12}$` after `strtoupper(trim())`, unique (422 `That code is already in use.`), returns the payload.
  - `POST admin/discounts/active/{id} {active}` → toggles, returns the payload.

- [ ] **Step 1: Write it**

```php
<?php
/* Admin → Discounts. The budget number lives here (not on Settings) so the
   codes it produces are on the same screen as the number. */
require_once __DIR__ . '/../../../includes/discounts.php';
require_once __DIR__ . '/../../../includes/settings.php';

function discounts_payload(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM discount_codes ORDER BY active DESC, FIELD(kind, \'first\', \'flat\', \'big\'), id')->fetchAll();
    $usage = $pdo->prepare(
        "SELECT COUNT(*) AS uses, COALESCE(SUM(code_amount), 0) AS given FROM orders WHERE discount_code = ? AND status <> 'cancelled'"
    );
    $codes = [];
    foreach ($rows as $r) {
        $row = discount_row($r);
        $usage->execute([$row['code']]);
        $u = $usage->fetch();
        $row['uses']  = (int)$u['uses'];
        $row['given'] = (float)$u['given'];
        $codes[] = $row;
    }
    return [
        'budget_pct'    => (float)setting('discount_budget_pct', '0'),
        'average_order' => discount_average_order($pdo),
        'codes'         => $codes,
    ];
}

function route($method, $action, $parts): void
{
    require_admin_cap('discounts');
    $pdo = db();

    if ($action === 'index' && $method === 'GET') {
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'budget' && $method === 'POST') {
        $pct = min(DISCOUNT_CEILING_PCT, max(0.0, (float)($_POST['pct'] ?? 0)));
        set_setting('discount_budget_pct', (string)$pct);
        discount_regenerate($pdo, $pct);
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'regenerate' && $method === 'POST') {
        discount_regenerate($pdo, (float)setting('discount_budget_pct', '0'));
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'rename' && $method === 'POST') {
        $id = (int)($parts[0] ?? 0);
        $code = strtoupper(trim((string)($_POST['code'] ?? '')));
        if (!preg_match('/^[A-Z0-9]{3,12}$/', $code)) {
            Response::error('A code is 3–12 letters or digits.', 422);
        }
        $dup = $pdo->prepare('SELECT COUNT(*) FROM discount_codes WHERE code = ? AND id <> ?');
        $dup->execute([$code, $id]);
        if ((int)$dup->fetchColumn() > 0) {
            Response::error('That code is already in use.', 422);
        }
        $pdo->prepare('UPDATE discount_codes SET code = ? WHERE id = ?')->execute([$code, $id]);
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'active' && $method === 'POST') {
        $id = (int)($parts[0] ?? 0);
        $pdo->prepare('UPDATE discount_codes SET active = ? WHERE id = ?')->execute([!empty($_POST['active']) ? 1 : 0, $id]);
        Response::json(discounts_payload($pdo));
    }
    Response::error('Not found', 404);
}
```

Note: renaming changes `code` text, and past orders reference the OLD text — the usage counter for a renamed code therefore restarts. Say so in the page copy (Task 8) rather than migrating history.

Also confirm `set_setting` refreshes the static cache so the following `setting()` read sees the new value (read `includes/settings.php:85`).

- [ ] **Step 2: Smoke** with the same minted admin token as Task 4: GET, POST budget 12, rename FEAST → PARTY, active off/on; delete the token row afterwards. `php -l` both files.

- [ ] **Step 3: Commit**

```bash
git add api/routes/admin/discounts.php api/routes/admin/settings.php
git commit -m "feat(admin): discounts route — budget, regenerate, rename, on/off, usage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Client meter maths + shared types + API clients

**Files:**
- Create: `web/src/apps/shared/lib/discounts.ts`, `web/scripts/verify-discount-meter.mjs`
- Modify: `web/src/apps/shared/types/index.ts` (`OrderListItem` gains `discount_code: string | null; code_pct: number; code_amount: number;`; new `DiscountOffer`), `web/src/apps/shared/api/endpoints.ts` (`discountsApi`), `web/src/apps/admin/types.ts` (`AdminOrderListItem` same three fields; `AdminDiscountCode`, `AdminDiscountsPayload`), `web/src/apps/admin/api/endpoints.ts` (`adminDiscountsApi`; `AdminNewOrderPayload.discount_code?: string`)

**Interfaces:**
- Produces:
  ```ts
  // shared/lib/discounts.ts
  export const DISCOUNT_CEILING_PCT = 24;
  export const DISCOUNT_WARN_PCT = 18;
  export type MeterTone = 'ok' | 'warn' | 'over';
  export function discountMeter(codePct: number, manualPct: number): { total: number; tone: MeterTone; text: string }
    // total = round2(code+manual); tone ok ≤18, warn ≤24, over >24;
    // text = `Total discount ${total} % of 24 % max`, or when over: `Over the 24 % ceiling — reduce the manual discount or remove the code.`
  export function codeAmount(subtotal: number, pct: number, maxAmount: number): number   // min(round2(subtotal*pct/100), maxAmount)
  export function offerText(o: DiscountOffer): string
    // `15 % off your first order, up to ₹100` | `10 % off orders above ₹400, up to ₹150`
  // shared/types
  export interface DiscountOffer { code: string; pct: number; max_amount: number; min_order: number; first_order_only: boolean }
  // shared/api
  export const discountsApi = { list: () => Promise<{codes: DiscountOffer[]}>, check: (body: {code, subtotal, phone}) => Promise<{code: string; pct: number; amount: number}> }
  // admin/types
  export interface AdminDiscountCode extends DiscountOffer { id: number; kind: 'first'|'flat'|'big'; active: boolean; created_at: string; uses: number; given: number }
  export interface AdminDiscountsPayload { budget_pct: number; average_order: number; codes: AdminDiscountCode[] }
  // admin/api
  export const adminDiscountsApi = { get, setBudget(pct), regenerate(), rename(id, code), setActive(id, active) }  // all → Promise<AdminDiscountsPayload>
  ```

- [ ] **Step 1: Failing script**

`web/scripts/verify-discount-meter.mjs`:

```js
/** The counter's discount meter and the customer's offer copy. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/discounts.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { discountMeter, codeAmount, offerText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

console.log('discountMeter');
check('10 + 5 → ok', { total: 15, tone: 'ok', text: 'Total discount 15 % of 24 % max' }, discountMeter(10, 5));
check('18 exactly → ok', 'ok', discountMeter(10, 8).tone);
check('18.01 → warn', 'warn', discountMeter(10, 8.01).tone);
check('24 → warn, still allowed', { total: 24, tone: 'warn' }, (({ total, tone }) => ({ total, tone }))(discountMeter(12, 12)));
check('24.01 → over with the ceiling text', { tone: 'over', text: 'Over the 24 % ceiling — reduce the manual discount or remove the code.' },
  (({ tone, text }) => ({ tone, text }))(discountMeter(12, 12.01)));
check('rounds to 2 places', 15.5, discountMeter(10.25, 5.25).total);

console.log('\ncodeAmount');
check('10 % of 1000', 100, codeAmount(1000, 10, 150));
check('capped', 150, codeAmount(2000, 10, 150));
check('rounded to paise', 33.33, codeAmount(333.33, 10, 150));

console.log('\nofferText');
check('first order', '15 % off your first order, up to ₹100', offerText({ code: 'WELCOME', pct: 15, max_amount: 100, min_order: 0, first_order_only: true }));
check('flat with floor', '10 % off orders above ₹400, up to ₹150', offerText({ code: 'VK10', pct: 10, max_amount: 150, min_order: 400, first_order_only: false }));
check('no floor', '10 % off, up to ₹150', offerText({ code: 'VK10', pct: 10, max_amount: 150, min_order: 0, first_order_only: false }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run** → fails. **Step 3: Implement**

```ts
import type { DiscountOffer } from '../types';

/** Mirrors DISCOUNT_CEILING_PCT in includes/discounts.php — the server is the authority. */
export const DISCOUNT_CEILING_PCT = 24;
/** Where the counter's meter turns amber. */
export const DISCOUNT_WARN_PCT = 18;

export type MeterTone = 'ok' | 'warn' | 'over';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function discountMeter(codePct: number, manualPct: number): { total: number; tone: MeterTone; text: string } {
  const total = round2(codePct + manualPct);
  const tone: MeterTone = total > DISCOUNT_CEILING_PCT ? 'over' : total > DISCOUNT_WARN_PCT ? 'warn' : 'ok';
  const text = tone === 'over'
    ? `Over the ${DISCOUNT_CEILING_PCT} % ceiling — reduce the manual discount or remove the code.`
    : `Total discount ${total} % of ${DISCOUNT_CEILING_PCT} % max`;
  return { total, tone, text };
}

export function codeAmount(subtotal: number, pct: number, maxAmount: number): number {
  return Math.min(round2((subtotal * pct) / 100), maxAmount);
}

export function offerText(o: DiscountOffer): string {
  const cap = `up to ₹${o.max_amount}`;
  if (o.first_order_only) return `${o.pct} % off your first order, ${cap}`;
  if (o.min_order > 0) return `${o.pct} % off orders above ₹${o.min_order}, ${cap}`;
  return `${o.pct} % off, ${cap}`;
}
```

- [ ] **Step 4: Types and API clients** per the Interfaces block; `adminApi.post` paths `discounts/budget`, `discounts/regenerate`, `discounts/rename/${id}`, `discounts/active/${id}`.

- [ ] **Step 5: Run the script (12 passed), `npx tsc --noEmit -p .` clean; commit**

```bash
git add web/src/apps/shared web/src/apps/admin/types.ts web/src/apps/admin/api/endpoints.ts web/scripts/verify-discount-meter.mjs
git commit -m "feat(web): discount meter maths, offer copy, types and API clients

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Storefront — Offers card, code on the bill, POST

**Files:**
- Create: `web/src/apps/storefront/components/OffersCard.tsx`
- Modify: `web/src/apps/storefront/components/BillDetails.tsx` (`BillGst.discountCode?: string | null`; label `${discountCode} (${pct}%)` when set), `web/src/apps/storefront/pages/Checkout.tsx`, `web/src/apps/storefront/pages/OrderSuccess.tsx` and `MyAccount.tsx` (pass `discountCode: order.discount_code` where they build `gst` for `BillDetails` — grep `discountPct:` to find the spots)

**Interfaces:**
- Consumes: `discountsApi`, `offerText`, `codeAmount`, `computeOrderTotal` (`shared/lib/gst.ts`).
- Produces: `OffersCard({ subtotal, phone, applied, onApply, onRemove })` where `applied: {code, pct, amount} | null`; `Checkout` posts `discount_code` and prices with `computeOrderTotal(total, gst_rate, applied?.pct ?? 0)`.

- [ ] **Step 1: `OffersCard`**

```tsx
import { useEffect, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { discountsApi } from '../../shared/api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { offerText } from '../../shared/lib/discounts';
import { rupees } from '../../shared/lib/format';
import { Input } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';

export interface AppliedCode { code: string; pct: number; amount: number }

/**
 * "Offers for you": the active codes as tappable chips plus a box for a code
 * the customer already has. The server decides what a code is worth; this
 * only asks. When the cart changes under an applied code it is re-checked and
 * dropped with a toast if it no longer qualifies.
 */
export function OffersCard({ subtotal, phone, applied, onApply, onRemove }: {
  subtotal: number; phone: string; applied: AppliedCode | null;
  onApply: (a: AppliedCode) => void; onRemove: () => void;
}) {
  const offers = useFetch(() => discountsApi.list(), []);
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const apply = async (c: string) => {
    setBusy(true); setErr('');
    try {
      onApply(await discountsApi.check({ code: c, subtotal, phone }));
      setCode('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Re-check an applied code whenever the cart total or phone changes.
  useEffect(() => {
    if (!applied) return;
    let stale = false;
    discountsApi.check({ code: applied.code, subtotal, phone })
      .then((r) => { if (!stale) onApply(r); })
      .catch((e) => { if (!stale) { onRemove(); toast.info(`${applied.code} removed: ${(e as Error).message}`); } });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, phone]);

  const codes = offers.data?.codes ?? [];
  if (codes.length === 0 && !applied) return null;

  return (
    <section className="card-soft p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Offers</h2>
      {applied ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-900 bg-brand-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-900"><Tag className="h-4 w-4" /> {applied.code} · −{rupees(applied.amount)}</span>
          <button type="button" onClick={onRemove} aria-label="Remove code" className="rounded-full p-1 text-brand-500 hover:bg-cream-100"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {codes.map((o) => (
              <li key={o.code}>
                <button type="button" disabled={busy} onClick={() => apply(o.code)}
                  className="flex w-full items-center justify-between rounded-xl border border-dashed border-brand-300 px-4 py-2.5 text-left hover:border-brand-900">
                  <span className="font-mono text-sm font-bold text-brand-900">{o.code}</span>
                  <span className="text-xs text-brand-600">{offerText(o)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Have a code?" aria-label="Discount code" className="font-mono" />
            <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => apply(code)}>Apply</Button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </>
      )}
    </section>
  );
}
```

(Check `Button`'s variant names and `useToast`'s method names in the codebase and match them.)

- [ ] **Step 2: Checkout**

- State `const [applied, setApplied] = useState<AppliedCode | null>(null);`
- Replace `const gst = computeGst(total, settings?.gst_rate)` with `const gst = computeOrderTotal(total, settings?.gst_rate, applied?.pct ?? 0)` and pass `gst={{ ...gst, discountCode: applied?.code ?? null }}` to `BillDetails` (check `computeOrderTotal`'s return shape matches `BillGst`; `computeGst`'s did).
- Mount `<OffersCard subtotal={total} phone={normalizePhone(phone) ?? ''} applied={applied} onApply={setApplied} onRemove={() => setApplied(null)} />` in the right column above `UpsellStrip` (and, like the upsell, once in the left column for `< md` — reuse the same `md:hidden` / `hidden md:block` trick, or simpler: render it only in the aside, which is above the bill on mobile anyway since the aside follows the form — pick the simpler and say which).
- POST body: `discount_code: applied?.code`.
- On a 422 from create whose message names the code, drop `applied` and show the message (the existing `setFormError` path already shows it).

- [ ] **Step 3: `BillDetails` label** — `Discount ({pct}%)` becomes `` `${gst.discountCode ?? 'Discount'} (${pct}%)` ``. Order-success / account pass `discountCode: order.discount_code`.

- [ ] **Step 4: Check** in the browser pane (budget is 10 locally): `/checkout` with ₹500 in the cart → Offers card lists WELCOME / VK10 / FEAST with copy; tap VK10 → bill row `VK10 (10%) − ₹50`, Place order total drops by ₹50 + GST share; remove a dish so subtotal < ₹400 → toast and code removed; type `NOPE` → "That code isn't valid."; place one order with VK10 → DB row has `discount_code='VK10'`; delete it by id. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/apps/storefront
git commit -m "feat(checkout): offers card — apply a code, see it on the bill

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Counter — code box + meter in `NewOrder.tsx`

**Files:**
- Modify: `web/src/apps/admin/pages/NewOrder.tsx` (billing adjustments block ~825-880; state; payload ~500; edit prefill ~227)

**Interfaces:**
- Consumes: `discountsApi.check`, `discountMeter`, `codeAmount`, `computeOrderTotal`.

- [ ] **Step 1: State + apply**

`const [codeText, setCodeText] = useState(''); const [applied, setApplied] = useState<{code: string; pct: number; amount: number} | null>(null); const [codeErr, setCodeErr] = useState('');` Apply button next to a **Code** input (third cell in the adjustments grid → make it `grid-cols-3`): calls `discountsApi.check({ code: codeText, subtotal, phone: normalizePhone(phone) ?? '' })`; on error `setCodeErr(message)`. Re-check on `subtotal`/`phone` change like `OffersCard` does (drop with `setCodeErr` when it fails). Complimentary disables the code box and clears `applied`.

- [ ] **Step 2: Bill**

`const meter = discountMeter(applied?.pct ?? 0, Number(discountPct) || 0);` and `computeOrderTotal(subtotal, rate, meter.total, delivery, complimentary)`. Rows: keep `Discount (manual %)` for the manual part (`− ₹` = `bill.discountAmount − codeAmount(...)`) and add `${applied.code} (${applied.pct}%)` row with `− ₹codeAmount(subtotal, applied.pct, …)` — since the server caps by `max_amount` and the client only has `pct` (already the effective, capped pct from `check`), show `round2(subtotal · applied.pct / 100)`. Meter line under the inputs: `<p className={tone === 'over' ? 'text-red-600' : tone === 'warn' ? 'text-gold-800' : 'text-brand-500'}>{meter.text}</p>`; Save disabled when `meter.tone === 'over'`.

- [ ] **Step 3: Payload + prefill**

Payload adds `discount_code: applied?.code`. Edit prefill: if `order.discount_code`, set `codeText` and `applied = { code, pct: order.code_pct, amount: order.code_amount }` and `discountPct = order.discount_pct − order.code_pct`.

- [ ] **Step 4: Check** (tsc; if the local admin login works use the pane, else read-through + the Task 4 curl evidence). Commit:

```bash
git add web/src/apps/admin/pages/NewOrder.tsx
git commit -m "feat(counter): code box and the 24 % meter on New Order

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Admin → Discounts page

**Files:**
- Create: `web/src/apps/admin/pages/Discounts.tsx`
- Modify: `web/src/apps/admin/AdminArea.tsx` (route `discounts` under `RequireCap cap="discounts"`), `web/src/apps/admin/layout/AdminLayout.tsx:23` (nav item `{ to: '/admin/discounts', label: 'Discounts', icon: Percent, cap: 'discounts' }` after Reviews)

- [ ] **Step 1: The page** — `useFetch(() => adminDiscountsApi.get(), [])`; three blocks per the spec: **Budget** (number input 0–24, Save → `setBudget` → replaces data; confirmation line "Codes regenerated: WELCOME, VK12, FEAST"), **Codes** (active rows: code in `font-mono text-2xl`, Copy button using `navigator.clipboard.writeText` with a toast, `offerText(row)`, Active toggle → `setActive`, inline Rename (input, uppercase, 3–12, Save → `rename`, show the 422 message), usage `used N times · ₹X given`, and the note "Renaming starts the count again — past orders keep the old name."), **Inactive codes** (collapsed `<details>` with code + usage). "Regenerate now" button → `regenerate`. Follow `Reviews.tsx` for structure/skeleton/error patterns.

- [ ] **Step 2: Route + nav; tsc clean; pane check if admin login works (else read-through). Commit:**

```bash
git add web/src/apps/admin
git commit -m "feat(admin): Discounts page — budget, the three codes, usage, rename, on/off

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Receipt line, README, builds, APK

**Files:**
- Modify: `web/src/apps/shared/lib/receiptText.ts:48-60,206` (`ReceiptOrder.discount_code?: string | null`; line label `${order.discount_code ?? 'Discount'} (${pct}%)`) and its verify script `web/scripts/verify-receipt-text.mjs` (one new case: a code order prints `VK10 (10%)`)
- Modify: `README.md` (new `## Discount codes` section after "Menu options": what the budget is, the three codes and their rules, the 24 % ceiling, that renaming restarts usage; deploy step: migration 016 then set the budget on Admin → Discounts)

- [ ] **Step 1** receipt + script (run it). **Step 2** README. **Step 3** full verification:

```bash
C:/xampp/php/php.exe scripts/verify-cumulative-migration.php
C:/xampp/php/php.exe scripts/verify-install-file.php
C:/xampp/php/php.exe scripts/verify-discounts.php
C:/xampp/php/php.exe scripts/verify-order-lines.php
cd web && node scripts/verify-discount-meter.mjs && node scripts/verify-receipt-text.mjs && node scripts/verify-cart.mjs && npx tsc --noEmit -p . && npm run build && cd ..
```

- [ ] **Step 4** Android: `cd web && VITE_API_ORIGIN=https://vaatsalyakitchens.in npm run build:app && npx cap sync android`, then from `web/android`: `JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot" ./gradlew assembleDebug`; copy to `~/Desktop/VaatsalyaKitchens-<date>.apk`; install with adb if `RF8N21BGN6M` is connected.

- [ ] **Step 5 Commit**

```bash
git add web/src/apps/shared/lib/receiptText.ts web/scripts/verify-receipt-text.mjs README.md
git commit -m "docs: discount codes; receipt names the code on its discount line

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then superpowers:finishing-a-development-branch. Production order: deploy → migration 016 → Admin → Discounts → set the budget.

# Discount Personas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The budget sizes rupee caps, five persona codes are derived from it, the Discounts page reports the month's actual give-away against the target, and a code alone is always allowed at the counter.

**Architecture:** `includes/discounts.php` stays the single authority (plan, regenerate, check, month stats, pause). Migration 017 widens the `kind` enum and adds `lapsed_days`. The admin route gains the stats and the auto-pause toggle; the storefront just learns the new `kind`s.

**Tech Stack:** PHP 8.2 / PDO / MariaDB, React 18 + TS, verify scripts (`scripts/verify-*.php`, `web/scripts/verify-*.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-15-discount-personas-design.md`

## Global Constraints

- Never compare a `?` placeholder to a string literal in SQL (production collation). PDO rowCount counts changed rows.
- `all_settings()` has a per-process static cache; pass fresh values through instead of reading back after `set_setting`.
- Migration trio: numbered file + guarded block and verification row in `database/migrate_production.sql` + `database/install_fresh.sql`; `php scripts/verify-cumulative-migration.php` and `php scripts/verify-install-file.php` must pass.
- PHP is `C:/xampp/php/php.exe`; local DB `C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens`. Verify scripts create throwaway DBs — read the top of `scripts/verify-discounts.php` for the pattern.
- Exact customer-facing sentences are in the spec; copy them verbatim.
- Commit after every task with a `feat(discounts): …` / `test(discounts): …` message.

---

### Task 1: Migration 017

**Files:**
- Create: `database/migration_017_discount_personas.sql`
- Modify: `database/migrate_production.sql` (after the 016 block; verification rows at the bottom), `database/install_fresh.sql` (the `discount_codes` CREATE and the settings seed), `includes/settings.php:58` (add `'discount_auto_pause' => '0'` after `discount_budget_pct`)

**Interfaces:**
- Produces: `discount_codes.kind ENUM('first','comeback','everyday','flat','big')`, `discount_codes.lapsed_days SMALLINT UNSIGNED NOT NULL DEFAULT 0`, setting `discount_auto_pause`.

- [ ] **Step 1: numbered file**

```sql
-- migration_017_discount_personas.sql — five persona codes.
-- kind gains comeback/everyday; lapsed_days > 0 means "returning customer who
-- has not ordered in N days". discount_auto_pause pauses non-first codes when
-- the month's give-away exceeds the budget.
ALTER TABLE discount_codes MODIFY COLUMN kind ENUM('first','comeback','everyday','flat','big') NOT NULL;
ALTER TABLE discount_codes ADD COLUMN lapsed_days SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER first_order_only;
INSERT IGNORE INTO settings (`key`, value) VALUES ('discount_auto_pause', '0');
```

- [ ] **Step 2: cumulative file** — add a `-- --- migration_017: discount personas` block after 016 using the same `SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', '…'))` guard for the column; the MODIFY is idempotent, run it unguarded. Append verification rows `discount_codes.lapsed_days` and `settings discount_auto_pause` (`IF(COUNT(*)=1,'OK','MISSING') FROM settings WHERE \`key\`='discount_auto_pause'`).
- [ ] **Step 3: install file** — update the `discount_codes` CREATE (enum + column) and the settings seed.
- [ ] **Step 4: verify** — `C:/xampp/php/php.exe scripts/verify-cumulative-migration.php` and `… scripts/verify-install-file.php` pass; apply the numbered file to the local DB.
- [ ] **Step 5: commit** `feat(db): migration 017 — discount personas`

---

### Task 2: Engine — plan, regenerate, check, stats, pause

**Files:**
- Modify: `includes/discounts.php`
- Test: `scripts/verify-discounts.php` (rewrite the plan/regenerate/check sections; keep the harness)

**Interfaces (produces):**

```php
const DISCOUNT_CEILING_PCT = 24.0;
const DISCOUNT_BUDGET_MAX  = 50.0;
function discount_plan(float $budgetPct, float $avgOrder): array   // rows: code, kind, pct, max_amount, min_order, first_order_only, lapsed_days
function discount_regenerate(PDO $pdo, float $budgetPct): array    // matches every code by kind
function discount_month_stats(PDO $pdo): array                     // ['sales'=>float,'given'=>float,'pct'=>float]
function discount_paused(PDO $pdo, ?float $budgetPct = null): bool // setting on AND stats pct > budget
function discount_active(PDO $pdo): array                          // rows gain 'paused' => bool (kind !== 'first' && discount_paused)
function discount_check(PDO $pdo, string $code, float $subtotal, ?string $phone, ?int $excludeOrderId = null): array
function discount_combined_ok(float $codePct, float $manualPct): bool  // manual == 0 || sum <= 24
```

- [ ] **Step 1: failing checks** — replace the plan section of `verify-discounts.php`:

```php
check('budget 0 → no codes', [], discount_plan(0, 400));
$p = discount_plan(24, 400);            // C = round(0.24*400/10)*10 = 100
check('five codes', ['WELCOME','COMEBACK','VK10','VK20','FEAST'], array_column($p, 'code'));
check('kinds', ['first','comeback','everyday','flat','big'], array_column($p, 'kind'));
check('pcts', [50.0,30.0,10.0,20.0,30.0], array_column($p, 'pct'));
check('caps from C=100', [150.0,150.0,100.0,150.0,300.0], array_column($p, 'max_amount'));
check('floors', [0.0,0.0,0.0,400.0,800.0], array_column($p, 'min_order'));
check('WELCOME first-order', true, $p[0]['first_order_only']);
check('COMEBACK lapsed 45', 45, $p[1]['lapsed_days']);
check('A=1000 B=24 → C=240', [360.0,360.0,240.0,360.0,720.0], array_column(discount_plan(24, 1000), 'max_amount'));
check('budget clamps at 50', 200.0, discount_plan(80, 400)[2]['max_amount']);
check('combined: code alone ok', true, discount_combined_ok(50, 0));
check('combined: 50 + 1 no', false, discount_combined_ok(50, 1));
check('combined: 12 + 12 ok', true, discount_combined_ok(12, 12));
check('combined: 12 + 12.01 no', false, discount_combined_ok(12, 12.01));
```

  Regenerate section: after `discount_regenerate($pdo, 24)` five active; rename COMEBACK → `BACK4U` via SQL then regenerate again → still five active, `BACK4U` kept (id unchanged), no `COMEBACK` row; budget 0 → none active.

  Check section (throwaway DB; seed phones: `919000000001` with a delivered order 50 days old, `919000000002` with one 10 days old, `919000000003` with none; note `created_at` is what the lapsed query reads):

```php
check('WELCOME fresh phone: 50 % of 200 = 100', 100.0, discount_check($pdo,'WELCOME',200,'919000000003')['amount']);
check('WELCOME capped at 150', 150.0, discount_check($pdo,'WELCOME',1000,'919000000003')['amount']);
check('WELCOME needs phone', 'Enter your phone number to use WELCOME.', refused(fn() => discount_check($pdo,'WELCOME',500,null)));
check('WELCOME prior order', 'WELCOME is for your first order only.', refused(fn() => discount_check($pdo,'WELCOME',500,'919000000001')));
check('COMEBACK lapsed 50 days ok', 150.0, discount_check($pdo,'COMEBACK',1000,'919000000001')['amount']);
check('COMEBACK 10 days ago', "COMEBACK is for customers we haven't seen in a while.", refused(fn() => discount_check($pdo,'COMEBACK',500,'919000000002')));
check('COMEBACK never ordered', 'COMEBACK is for returning customers — try WELCOME on your first order.', refused(fn() => discount_check($pdo,'COMEBACK',500,'919000000003')));
check('COMEBACK needs phone', 'Enter your phone number to use COMEBACK.', refused(fn() => discount_check($pdo,'COMEBACK',500,null)));
check('VK10 anyone, no floor', 10.0, discount_check($pdo,'VK10',100,null)['amount']);
check('VK20 floor', 'Add ₹150 more to use VK20.', refused(fn() => discount_check($pdo,'VK20',250,null)));
check('FEAST 30 % of 1000 = 300 (cap 300)', 300.0, discount_check($pdo,'FEAST',1000,null)['amount']);
```

  Stats/pause section: insert this-month orders (subtotal 1000 with code_amount 300 and 'VK10'; subtotal 1000 with 0; a cancelled one with 500/500) → `discount_month_stats` = `['sales'=>2000.0,'given'=>300.0,'pct'=>15.0]`; with `set_setting('discount_auto_pause','1')` and budget 10 → `discount_paused($pdo, 10)` true, `discount_active` marks all but WELCOME `paused`, `discount_check($pdo,'VK10',…)` → `VK10 is taking a break this month.`, WELCOME still works; budget 24 → not paused. (The settings cache: call `set_setting` BEFORE the first `setting()` read in the process, or pass the budget explicitly — `discount_paused` reads the pause flag through `setting()`, so set it first.)

- [ ] **Step 2: run** `C:/xampp/php/php.exe scripts/verify-discounts.php` — fails.
- [ ] **Step 3: implement** in `includes/discounts.php`:

```php
const DISCOUNT_BUDGET_MAX = 50.0;
const DISCOUNT_KINDS = ['first', 'comeback', 'everyday', 'flat', 'big'];

function discount_plan(float $budgetPct, float $avgOrder): array
{
    $b = min(max($budgetPct, 0.0), DISCOUNT_BUDGET_MAX);
    if ($b <= 0) return [];
    $c = (float)(round($b / 100 * $avgOrder / 10) * 10);
    $snap = fn(float $r) => (float)(round($r / 50) * 50);
    $row = fn(string $code, string $kind, float $pct, float $cap, float $min, bool $first = false, int $lapsed = 0) =>
        compact('code', 'kind', 'pct') + ['max_amount' => $cap, 'min_order' => $min, 'first_order_only' => $first, 'lapsed_days' => $lapsed];
    return [
        $row('WELCOME',  'first',    50.0, 1.5 * $c, 0.0, true),
        $row('COMEBACK', 'comeback', 30.0, 1.5 * $c, 0.0, false, 45),
        $row('VK10',     'everyday', 10.0, $c,       0.0),
        $row('VK20',     'flat',     20.0, 1.5 * $c, $snap($avgOrder)),
        $row('FEAST',    'big',      30.0, 3 * $c,   $snap(2 * $avgOrder)),
    ];
}
```

  `discount_regenerate`: every kind matched with `$byKind` (drop `$byCode`); UPDATE/INSERT also write `lapsed_days`. `discount_row` adds `lapsed_days`. Order clause `FIELD(kind, 'first','comeback','everyday','flat','big')` everywhere it appears (also in `api/routes/admin/discounts.php`).

```php
function discount_month_stats(PDO $pdo): array
{
    $r = $pdo->query(
        "SELECT COALESCE(SUM(subtotal),0) AS sales, COALESCE(SUM(code_amount),0) AS given FROM orders
          WHERE status <> 'cancelled' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"
    )->fetch();
    $sales = (float)$r['sales']; $given = (float)$r['given'];
    return ['sales' => $sales, 'given' => $given, 'pct' => $sales > 0 ? round($given / $sales * 100, 2) : 0.0];
}
function discount_paused(PDO $pdo, ?float $budgetPct = null): bool
{
    if (setting('discount_auto_pause', '0') !== '1') return false;
    $budgetPct ??= (float)setting('discount_budget_pct', '0');
    return $budgetPct > 0 && discount_month_stats($pdo)['pct'] > $budgetPct;
}
```

  `discount_active($pdo)`: compute `$paused = discount_paused($pdo)` once, set `'paused' => $paused && $r['kind'] !== 'first'` on each row. `discount_check`: check order is 1 unknown, 2 floor, 3 phone-required (first OR lapsed code), 4 first-order, 5/6 comeback, 7 paused (LAST, so the customer hears the real reason first; skipped for `$ownCode` and for kind `first`). Comeback:

```php
if ($row['lapsed_days'] > 0 && !$ownCode) {
    // phone normalised exactly as for first-order; missing → "Enter your phone number to use CODE."
    $sql = "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM orders WHERE phone = ? AND status <> 'cancelled'";
    // + ' AND id <> ?' when $excludeOrderId !== null
    if ((int)$r['n'] === 0) throw new DiscountError("{$row['code']} is for returning customers — try WELCOME on your first order.");
    if (new DateTimeImmutable($r['last']) > new DateTimeImmutable("-{$row['lapsed_days']} days")) throw new DiscountError("{$row['code']} is for customers we haven't seen in a while.");
}
```

  `discount_combined_ok`: `return $manualPct <= 0 || round($codePct + $manualPct, 2) <= DISCOUNT_CEILING_PCT;`. Update the file's header comment.

- [ ] **Step 4: run** — all pass. Also run `scripts/verify-order-discount.php`; fix its seeded-code expectations (`['WELCOME','COMEBACK','VK10','VK20','FEAST']`) and add: counter `12 + 12 ok`, `50 + 1 no`, `50 + 0 ok`.
- [ ] **Step 5: commit** `feat(discounts): five persona codes sized by the budget; month stats and auto-pause`

---

### Task 3: Routes — public list, admin stats/pause, counter meter text

**Files:**
- Modify: `api/routes/discounts.php` (GET: drop `paused` rows; include `kind`), `api/routes/admin/discounts.php` (payload adds `month` = `discount_month_stats`, `auto_pause` bool, `paused` bool; `POST budget` clamps to `DISCOUNT_BUDGET_MAX`; new `POST auto_pause {on}` → `set_setting('discount_auto_pause', on ? '1' : '0')`, returns payload — pass the new flag through, do not read it back), `api/routes/admin/orders.php:87-104` (`counter_discount`: when `discount_combined_ok` fails and `codePct > DISCOUNT_CEILING_PCT`, the 422 reads `Discount (X %) cannot be added on top of CODE (Y %) — the ceiling is 24 %.`; otherwise the existing sentence).
- Test: extend `scripts/verify-order-discount.php` if it exercises the route; otherwise `curl` smoke with a minted token (see `includes/tokens.php`; delete only that token row).

- [ ] Steps: read the three files; make the edits; `C:/xampp/php/php.exe -l` each; run `verify-order-discount.php`; smoke `GET /api/discounts` locally; commit `feat(api): discount stats, auto-pause, kind on public codes`.

---

### Task 4: Web — types, offer text, meter, admin Discounts page

**Files:**
- Modify: `web/src/apps/shared/types/index.ts` (`DiscountOffer.kind`), `web/src/apps/admin/types.ts:255` (kind union + `lapsed_days`, `paused`; payload `month`, `auto_pause`, `paused`), `web/src/apps/shared/lib/discounts.ts` (`offerText` per spec; `discountMeter` gains tone `'code-only'` when `manualPct === 0 && codePct > 24` with text `Code alone — no manual discount can be added.`; `'over'` only when `manualPct > 0`), `web/src/apps/admin/api/endpoints.ts` (`adminDiscountsApi.autoPause(on)`), `web/src/apps/admin/pages/Discounts.tsx` (month bar, auto-pause toggle, paused tag, budget input max 50, help text "Budget = share of sales you'll give away; caps are sized from it"), `web/src/apps/admin/pages/NewOrder.tsx` (render the `code-only` tone amber, Save enabled), `web/src/apps/storefront/components/OffersCard.tsx` (only if it switches on kind).
- Test: `web/scripts/verify-discount-meter.mjs` (add: `(50,0)` → code-only; `(50,1)` → over; `(12,12)` → warn), `npx tsc --noEmit -p .` in `web/`.

- [ ] Steps: failing meter checks → implement → pass → tsc → commit `feat(web): persona offers, month target bar, auto-pause, code-alone meter`.

---

### Task 5: README + spec status

- [ ] `README.md` "Discount codes" section: the five codes table, "budget sizes the caps", month bar, auto-pause, deploy step for 017. Mark the spec `Status: implemented`. Commit `docs: discount personas`.

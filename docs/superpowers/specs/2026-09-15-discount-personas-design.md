# Discount codes v2: a spend target, five personas, honest reporting

**Date:** 2026-09-15
**Status:** implemented
**Supersedes:** the plan table in `2026-09-12-discount-codes-design.md` (everything else there stands)

## What Salil asked for

The budget number must not become the code percentage. "24 %" means the
kitchen is willing to give away about 24 % of sales across all discounted
orders — the codes themselves may say 10, 20, 30 or 50 %, because the rupee
cap is what limits each one. Use the budget to size the caps, use several
codes for several kinds of customer (first order, lapsed, everyday, big
basket), and show on the Discounts page whether the kitchen is actually
inside its target.

## Design

### The plan — `discount_plan(float $budgetPct, float $avgOrder): array`

`C` = everyday cap = `round(B / 100 × A / 10) × 10` rupees (B = budget, A =
average order). B = 24, A = ₹400 → C = ₹100. `snap(x)` = round to ₹50.
Budget 0 → empty plan. B is clamped to 0–50.

| kind | code | pct | max_amount | min_order | who may use it |
|---|---|---|---|---|---|
| first | `WELCOME` | 50 | 1.5 C | 0 | phone has no earlier non-cancelled order |
| comeback | `COMEBACK` | 30 | 1.5 C | 0 | phone has an earlier non-cancelled order, none in the last 45 days |
| everyday | `VK10` | 10 | C | 0 | anyone |
| flat | `VK20` | 20 | 1.5 C | snap(A) | anyone |
| big | `FEAST` | 30 | 3 C | snap(2 A) | anyone |

Code texts are fixed (no more `VK<budget>`); marketing renames them on the
Discounts page as before. `discount_regenerate` matches every code by KIND
(the most recent row of that kind keeps its name and id); the old
text-match for `flat` goes away.

### Schema — migration 017 (`migration_017_discount_personas.sql`)

```sql
ALTER TABLE discount_codes
  MODIFY COLUMN kind ENUM('first','comeback','everyday','flat','big') NOT NULL,
  ADD COLUMN lapsed_days SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER first_order_only;
INSERT IGNORE INTO settings (`key`, value) VALUES ('discount_auto_pause', '0');
```

`lapsed_days` > 0 means: the phone must have at least one earlier
non-cancelled order and none newer than N days. The plan sets 45 on the
comeback code. Cumulative and install files get the guarded block and the
verification rows as usual.

### Eligibility — `discount_check`

Order of checks and exact messages (existing ones unchanged):

1. unknown / inactive → *That code isn't valid.*
2. below floor → *Add ₹X more to use CODE.*
3. `first_order_only` or `lapsed_days > 0` and no phone → *Enter your phone number to use CODE.*
4. first-order code, phone has a prior order → *CODE is for your first order only.*
5. comeback code, phone has NO prior order → *CODE is for returning customers — try WELCOME on your first order.*
6. comeback code, phone ordered within `lapsed_days` → *CODE is for customers we haven't seen in a while.*
7. paused (see below) → *CODE is taking a break this month.*

"Prior order" = `orders.phone = ? AND status <> 'cancelled'` (own order
excluded when editing, as today). The own-order rule (an order keeps the code
it was placed with) stays and now also skips checks 4–7.

### Reporting and the pause

`discount_month_stats(PDO): array{sales, given, pct}` — this calendar month,
`status <> 'cancelled'`: `sales` = SUM(subtotal) over all orders, `given` =
SUM(code_amount), `pct` = given / sales × 100 (0 when sales is 0), 2 dp.

The Discounts page shows *"This month: ₹given on ₹sales of sales — Z % of the
24 % target"* with a bar: green ≤ target, amber above it. Per-code usage
(uses, ₹given) stays.

Setting `discount_auto_pause` ('0' | '1', toggle on the Discounts page).
When on and `pct > budget`, every code except `first` is **paused**: absent
from `GET /api/discounts`, refused by `discount_check` (message 7), shown
greyed with a "Paused — over target this month" tag on the admin page. Pause
is computed at read time; nothing is written. Off by default.

### Counter ceiling

`DISCOUNT_CEILING_PCT = 24` stays the combined per-order rule, with one
change: **a code alone is always allowed.** The ceiling limits the manual
discount that can be stacked on top: `discount_combined_ok(codePct,
manualPct)` = `manualPct == 0 || codePct + manualPct <= 24`. (WELCOME on a
₹300 order is 50 % capped to ₹150 = 50 % effective; the rep may not add a
manual discount on top of it, but the code itself is the kitchen's offer.)
The meter text on New Order: over the ceiling with a manual discount →
existing red text; a code alone above 24 → *"Code alone — no manual discount
can be added."* in amber, Save enabled.

### Storefront

`offerText` gains the new personas: first → *50 % off your first order, up to
₹150*; comeback → *30 % off — welcome back! up to ₹150*; everyday → *10 %
off, up to ₹100*; flat/big as today. `GET /api/discounts` returns `kind`
too. Nothing else changes on checkout.

### Not changing

Order columns, `compute_order_total`, the receipt line, rename/active
endpoints, the rate limit.

## Verification

- `scripts/verify-discounts.php` rewritten for the new table (B = 0, 24, 50;
  caps from A = 400 and A = 1000), regenerate by kind for all five, every
  message 1–7, comeback with prior order 50 days old (ok) vs 10 days old
  (refused) vs none (refused), `discount_month_stats`, pause on/off,
  `discount_combined_ok(50, 0)` true / `(50, 1)` false / `(12, 12)` true.
- `scripts/verify-order-discount.php`: counter create with WELCOME alone at
  50 % passes; WELCOME + 1 % manual is refused.
- `web/scripts/verify-discount-meter.mjs`: the "code alone" tone/text.
- Migration verifiers for 017.

# Discount codes: one budget number, three codes, a 30 % ceiling

**Date:** 2026-09-12
**Status:** approved, not yet implemented
**Depends on:** `2026-09-12-menu-cart-checkout-design.md` (checkout layout;
this spec adds a card to it)

## What Salil asked for

Discounts exist only at the counter today (a rep types a percentage on New
Order, `migration_006`). Bring them to the customer side, Zomato-style: a
code typed at checkout. On the admin side one setting — the percentage of
sales the kitchen is willing to give away — from which the system derives
2–3 codes by rule, shown on an admin Discounts screen so they can be used in
marketing. Codes must also work at the counter, but **a code plus the manual
counter discount must never exceed 30 % of the pre-tax subtotal**, and the
rep must see that coming.

## Facts that shape the design

- `compute_order_total($subtotal, $rate, $discountPct, $delivery, $comp)` in
  `includes/gst.php` (mirrored in `shared/lib/gst.ts`) already takes the
  discount before GST and stores `discount_pct` / `discount_amount` on the
  order. Customer orders call `compute_gst` and store 0 / 0. **The customer
  path switches to `compute_order_total`; no new maths.**
- `discount_pct` on the order is a single number. A code and a manual
  percentage on the same counter order must both be recorded, so the order
  needs to know which part came from the code.
- Customers are identified by phone (`customers.phone`); a guest's first
  order creates the row. "First order" means: no non-cancelled order exists
  for that phone before this one.
- Average order value is computable from `orders` (delivered, last 30 days).
- Settings live in the `settings` table, editable on Admin → Settings
  (cap `settings`), exposed to the storefront through `/api/me`.
- Admin caps: `super`/`admin` hold `settings`; a new `discounts` cap goes to
  the same two roles.

## Design

### Schema — migration 016 (`migration_016_discount_codes.sql`)

```sql
CREATE TABLE IF NOT EXISTS discount_codes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(20)  NOT NULL,
  kind             ENUM('first','flat','big') NOT NULL,
  pct              DECIMAL(5,2) NOT NULL,
  max_amount       DECIMAL(10,2) NOT NULL,        -- rupee cap per order
  min_order        DECIMAL(10,2) NOT NULL DEFAULT 0, -- pre-tax subtotal floor
  first_order_only TINYINT(1)   NOT NULL DEFAULT 0,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discount_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE orders
  ADD COLUMN discount_code   VARCHAR(20)   NULL AFTER discount_pct,
  ADD COLUMN code_pct        DECIMAL(5,2)  NOT NULL DEFAULT 0 AFTER discount_code,
  ADD COLUMN code_amount     DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER code_pct;
```

Settings row: `discount_budget_pct` (default `'0'` — feature off).

On an order, `discount_pct` / `discount_amount` keep meaning **the total
discount** (so every existing report, receipt and drawer stays right);
`code_pct` / `code_amount` say how much of it the code contributed;
`discount_pct − code_pct` is the manual counter part. Codes are never
deleted — `active = 0` — because orders reference them by text.

### The engine — `includes/discounts.php`

Pure functions, verified by `scripts/verify-discounts.php`:

```php
/* Derive the three codes from the budget B (percent) and the average order value A (rupees). */
function discount_plan(float $budgetPct, float $avgOrder): array
```

| kind | code | pct | max_amount | min_order | first_order_only |
|---|---|---|---|---|---|
| first | `WELCOME` | min(1.5·B, 25) | ₹100 | 0 | yes |
| flat | `VK<round B>` e.g. `VK10` | B | ₹150 | round(A / 50)·50 | no |
| big | `FEAST` | min(B + 5, 30) | ₹300 | round(2A / 50)·50 | no |

`A` = average `subtotal` of delivered orders in the last 30 days, or ₹400
when fewer than 10 such orders exist. Percentages are rounded to whole
numbers; a budget of 0 yields an empty plan. **No code can exceed 30 %** —
the same ceiling as the combined rule below.

```php
/* Apply the plan to the database: deactivate every active row, insert the new plan.
   A code that already exists with the same text is updated in place (keeps its id). */
function discount_regenerate(float $budgetPct): void

/* Validate a code for a cart. Returns ['code','pct','amount','max_amount','min_order']
   or throws DiscountError with a customer-readable message. */
function discount_check(string $code, float $subtotal, ?string $phone): array
```

`discount_check` messages (exact text):

- unknown or inactive: *"That code isn't valid."*
- below floor: *"Add ₹X more to use WELCOME."* (`X = min_order − subtotal`)
- first-order-only and the phone has an earlier non-cancelled order:
  *"WELCOME is for your first order only."*
- phone missing on a first-order code: *"Enter your phone number to use
  WELCOME."*
- amount = `min(round(subtotal · pct / 100, 2), max_amount)`; the effective
  percentage stored on the order is `amount / subtotal · 100` rounded to 2
  places so `compute_order_total` reproduces the same rupee figure.

```php
/* The 30 % ceiling, in one place. */
const DISCOUNT_CEILING_PCT = 30.0;
function discount_combined_ok(float $codePct, float $manualPct): bool
```

Regeneration happens when the admin saves `discount_budget_pct` (Settings) or
presses **Regenerate** on the Discounts page; it does not run on a schedule,
so `A` is whatever it was when the admin last saved — good enough, and
predictable.

### Customer checkout

- **API:** `POST /api/discounts/check` `{code, subtotal, phone}` →
  `{code, pct, amount}` or a 422 with the message above. `GET /api/discounts`
  → the active codes (`code, pct, max_amount, min_order, first_order_only`)
  for the "offers for you" chips. Both public; rate-limited like `/api/auth`.
- **Checkout card "Offers"** (right column, above the bill; on mobile above
  the bill too): the active codes as tappable chips — "WELCOME · 15 % off
  your first order, up to ₹100"; tapping fills the code box; plus a text box
  **Have a code?** with Apply. On success the bill gains a row
  *"WELCOME (15 %) − ₹75"* and the Place-order button shows the new total.
  A code that stops qualifying when the cart changes (subtotal drops below
  its floor) is re-checked on every cart change and dropped with a toast.
- **Order create (`api/routes/orders.php`)** accepts `discount_code`; the
  server re-runs `discount_check` with the recomputed subtotal and the posted
  phone (never trusts the client's amount), then bills with
  `compute_order_total($subtotal, $rate, $pct)` and writes `discount_code`,
  `code_pct = code_amount = discount_pct/amount`. A code that fails at this
  point returns the message as a 422 — the same guard as the minimum order.
- Order-success, the account order view and the WhatsApp slip show the
  discount row via the existing `BillDetails` discount rendering; the label
  becomes "WELCOME (15 %)" when `discount_code` is set.

### Counter (Admin → New Order, edit-order)

- A **Code** input beside the manual **Discount %** input. Applying a code
  calls the same `/api/discounts/check` (with the customer's phone from the
  form). The bill preview shows two rows when both are present:
  *Discount (10 %)* and *WELCOME (15 %)*, and a **meter line** under the
  inputs: `Total discount 25 % of 30 % max` — normal ≤ 20 %, amber over 20 %,
  red over 30 % with the Place-order button disabled and the text
  *"Over the 30 % ceiling — reduce the manual discount or remove the code."*
- `POST admin/orders` (`create`, `update`) takes `discount_code`; the server
  re-checks the code, adds its pct to the manual pct, and refuses with 422
  *"Discount (X %) + code (Y %) exceeds the 30 % ceiling."* when
  `discount_combined_ok` is false. Stored: `discount_pct` = combined,
  `code_pct` / `code_amount` = the code's share, `discount_code`.
- Complimentary orders ignore codes (nothing to discount).

### Admin → Discounts page (cap `discounts`; roles super, admin)

Nav item **Discounts** (icon `Percent`) after Reviews. Content:

1. **Budget** — number input "Discount budget (% of sales)", Save. Saving
   regenerates the plan and shows a confirmation listing the new codes.
   (The same field is *not* repeated on Settings; one home.)
2. **Codes** — a card per active code: the code in large monospace with a
   **Copy** button, the rule in words ("15 % off your first order, up to
   ₹100"), an **Active** toggle, and usage: *used 12 times · ₹840 given*
   (from `orders` where `discount_code = code` and status ≠ cancelled).
   A **Rename** action (inline input, uppercase A–Z0–9, 3–12 chars, unique)
   for marketing-friendly names — the rule stays what it was.
3. **Inactive codes** — collapsed list with their usage, for the record.

API (`api/routes/admin/discounts.php`): `GET list`, `POST budget {pct}`,
`POST regenerate`, `POST rename {id, code}`, `POST active {id, active}`.
`admin/settings.php` ignores `discount_budget_pct` (it is owned by this
route); `/api/admin/me` exposes `discounts` in caps.

### What does not change

- GST maths, rounding, and every column that existed before.
- The manual counter discount input and its validation.
- Receipts and kitchen tickets: they print `discount_pct`/`discount_amount`
  as before; the code's name is added to the receipt's discount line only
  (`receiptText.ts`), nothing else.

## Verification

- Migration verifiers for 016 (both files).
- `scripts/verify-discounts.php` (throwaway DB): `discount_plan` table above
  for B = 0, 10, 20, 30 (caps at 25/30); `A` fallback under 10 orders;
  `discount_regenerate` deactivates old rows and keeps ids for unchanged
  codes; `discount_check` — each message, the rupee cap, first-order via an
  earlier delivered order vs an earlier cancelled one; `discount_combined_ok`
  at 29.99 / 30 / 30.01.
- `scripts/verify-order-discount.php`: customer create with a good code
  stores the right columns; with a stale code returns 422; counter create at
  15 + 15 passes, 15 + 16 is refused.
- `web/scripts/verify-discount-meter.mjs`: the meter's colour thresholds and
  the disabled state.
- Builds, Android bundle, browser-pane checks of checkout with a code applied
  and New Order over the ceiling.

# Menu, cart and checkout: variant groups, dish detail, floating cart, editable checkout

**Date:** 2026-09-12
**Status:** approved, not yet implemented
**Companion:** `2026-09-12-discount-codes-design.md` (built after this one)

## What Salil asked for, and what it means

1. **Variants need their own label, not "Choose size" everywhere.** Most of
   today's variants are preparations (Ghee / Butter / Sarson Tel). The label
   must be the kitchen's own text, per item.
2. **On small screens a description ends in "…See more"**, which opens a modal
   with the dish's photos and the full description.
3. **"Without Vegetables" must be a radio pair, not a checkbox** — With /
   Without Vegetables, so a customer sees both before choosing.
4. **The cart should be a floating button** on the app, and on the web either a
   small button or an open cart in the empty right column. Decision below.
5. **Remove the GST sentence** from checkout. Prices stay tax-exclusive; only
   the note goes.
6. **Checkout should let the customer edit the cart** (+ / − / delete), use the
   width it has, pick date and time separately with something better than a
   native datetime input, and use the right column to upsell.

## Facts that shape the design

- `menu_item_variants` is one flat list per item; the picker renders it as a
  single radio group titled "Choose size" (`ItemPickerModal.tsx:78`). Deluxe
  Chinese Combo already has a 15-way "Combination" variant *and* needs a
  With/Without Vegetables choice, so **an item needs several radio groups**.
  Two groups on one item is the whole reason this is a schema change and not
  a rename.
- "Without Vegetables" was loaded by `database/menu_options.sql` as a ₹0
  add-on on every category-9 dish plus the two Chinese combos.
- A cart line carries one `variant?: CartVariant`; the cart key is
  `${itemId}::${variantId|0}::${addonIds}` (`shared/types/index.ts:154`);
  `order_items` snapshots `variant_id` (one) and `variant_name` (one), and
  `addon_ids` as a comma list. `includes/order_lines.php` is the single
  resolver used by both the customer and the admin order routes.
- Opening hours already reach the storefront in the menu payload
  (`MenuHours`, `shared/lib/hours.ts`) and are re-checked by the server on
  order create. The time picker can be built from them without a new API.
- Menu photos (up to three per dish) and the description are already in the
  public menu payload (`MenuItem.photos`, `MenuItem.description`).
- `BillDetails` is shared by checkout, order-success and the account order
  view; today it is read-only by design.
- The bottom cart bar (`CartBar.tsx`) is full-width on every screen and opens
  `CartSheet` (bottom sheet on mobile, right drawer on desktop).

## Design

### 1. Variant groups (items 1 and 3)

**Schema — migration 015 (`migration_015_variant_groups.sql`):**

```sql
ALTER TABLE menu_item_variants
  ADD COLUMN group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation' AFTER item_id;
ALTER TABLE order_items
  ADD COLUMN variant_ids VARCHAR(255) NULL AFTER variant_id;
```

`order_items.variant_id` stays (legacy reads); new orders write `variant_ids`
("12,45") and leave `variant_id` NULL. Readers use
`variant_ids ?? variant_id`. Guarded copies go into `migrate_production.sql`
(with verification rows) and `install_fresh.sql`; the two verifier scripts
must pass.

**Data (`menu_options.sql`, appended section "015 — vegetables as a group"):**

- The 15 Deluxe Chinese Combo variants: `group_label = 'Combination'`.
- Delete the "Without Vegetables" add-on rows; insert for the same dishes a
  `Vegetables` group: *With Vegetables* (default, ₹0, sort 0) and
  *Without Vegetables* (₹0, sort 1).
- `menu_snapshot.sql` is regenerated with `scripts/export-menu-sql.php`, which
  gains the `group_label` column.

**Semantics:** within an item, variants are grouped by `group_label` (ordered
by the smallest `sort_order` in the group, then label). Each group is a
radio: exactly one choice. `is_default` marks the preselected choice per
group; a group without a default preselects its first row. Price = base +
sum of the chosen deltas + sum of add-ons.

**Public menu (`api/routes/menu.php`):** each variant carries `group_label`.
The shape stays a flat `variants[]` — grouping is a client concern — so
nothing else in the payload changes.

**Order resolver (`includes/order_lines.php`):** a posted line carries
`variant_ids: number[]` (the old `variant_id` is still accepted and treated
as a one-element list, so an old app build keeps working). Validation: the
chosen ids must belong to the item, and there must be exactly one per group
the item has. Error text: `"Please choose <label> for <item>"`. Snapshot:
`variant_name` = chosen names joined by ", " in group order (so receipts,
kitchen tickets, WhatsApp slips and the admin drawer need no change);
`variant_ids` = the ids joined by ",".

**Admin menu (`api/routes/admin/menu.php`, `ItemFormModal.tsx`):** each
variant row gets a *Group* text input (default "Preparation", `maxLength 40`,
`<datalist>` of labels already used on the menu). `update_item` writes
`group_label`. CSV import/export (`ImportModal`, `sampleCsv.ts`,
`export-menu-sql.php`) carry it as `variant_group`; a blank means
"Preparation".

**Admin New Order and edit-order (`NewOrder.tsx`, `OrderDrawer.tsx`):** the
rep's item picker shows one radio group per label, same as the customer's.
Edit-order prefill reads `variant_ids`, falling back to `variant_id`.

**Client types (`shared/types/index.ts`):**

```ts
export interface MenuVariant { id; name; group_label: string; price_delta; is_default; sort_order }
export interface CartLine   { …; variants: CartVariant[]; addons: CartAddon[]; qty }
export function cartKey(id: number, variantIds: number[] = [], addonIds: number[] = []): string
  // `${id}::${sorted variantIds joined ','}::${sorted addonIds joined ','}`
export function linePrice(l): base + Σ variant deltas + Σ addon prices
export function groupVariants(variants: MenuVariant[]): { label: string; options: MenuVariant[] }[]
```

`lineLabel(name, variantsText, addonsText)` is unchanged in shape; callers
pass the joined variant names. `CartContext` persists lines in localStorage
under a **new key** (`vk-cart-v2`) so a stale one-variant cart from an older
build is dropped rather than mis-priced. `ReorderButton` rebuilds lines from
`variant_ids`.

### 2. Dish detail modal (item 2)

`MenuItemRow` keeps `line-clamp-2` on the description. On screens below `sm`
a trailing **"…See more"** button appears when the description is longer than
the clamp (measured with `scrollHeight > clientHeight` after layout, re-checked
on resize). Tapping opens `DishDetailModal`:

- gallery of the dish's photos (horizontal snap-scroll, dots below; one photo
  shows as a single image; no photos → no gallery), aspect 4:3;
- name, full description, "from ₹price" if it has variants else the price;
- the same **Add** control as the row: adds directly, or opens
  `ItemPickerModal` when the item has options; closed-category state shows the
  same "back at …" line the row shows.

On `sm+` the description is not clamped and there is no link; the photo is
already beside the row there.

### 3. Cart placement (item 4) — decision

- **All screens below `lg`, web and app alike:** `CartBar` is replaced by
  `CartFab` — a 56 px round button fixed bottom-right (`right-4`, above the
  mobile tab bar on the storefront), brand-900, cart icon, count badge at the
  top-right corner, and a small pill beneath it with the total. Tap → the
  existing `CartSheet`. Hidden when the cart is empty and while the sheet is
  open.
- **`lg+` on `/order`:** a third column (`lg:grid-cols-[13rem_1fr_20rem]`)
  holds `CartPanel` — an always-open cart: lines with + / − / delete, subtotal,
  and a "Checkout →" button; sticky under the header. `CartFab` is hidden on
  this page at `lg+`. When the cart is empty the panel shows a short "Your
  cart is empty — add dishes from the menu" state, so the column never
  collapses.
- **`lg+` on every other page:** `CartFab` (there is no column to use).

`CartSheet` and `CartPanel` share one `CartLines` component (line rows with
the quantity stepper and delete), which is also what checkout uses.

### 4. Checkout copy (item 5)

`BillDetails` note becomes: comp → "This order is on us — nothing to pay."
otherwise → "Final price is confirmed by us on the phone — delivery charges
may apply." The GST sentence is deleted; the CGST/SGST rows stay.

### 5. Checkout page (item 6)

**Layout.** `md+`: `grid-cols-[1fr_24rem]`. Left, in order: **Your order**
(editable lines via `CartLines`, with "Add more dishes" link), **Delivery**
(address picker), **When** (date + time), **Contact**, **Notes / occasion**.
Right, sticky: **Goes well with** upsell, then the bill (`BillDetails`,
read-only — the lines are edited on the left), minimum-order warning, Place
order, call link, push nudge. Below `md` it is one column: Your order → Goes
well with → Delivery → When → Contact → bill → Place order. Cards get
`p-6` and `space-y-6` instead of `p-5` / `space-y-4`: the page is allowed to
breathe.

Deleting the last line navigates back to `/order` (the existing
`Navigate` guard already does this once `lines` is empty).

**Date + time (`DatePicker.tsx`, `TimePicker.tsx`, replacing
`DateTimePicker.tsx`).** State stays a single `whenLocal` string
(`YYYY-MM-DDTHH:mm`) so `formatNeededOn`, `needed_at` and the hours check are
untouched.

- `DatePicker`: a horizontal strip of the next 7 days as chips — "Today",
  "Tomorrow", then "Sat 14", "Sun 15"…; a day the kitchen is closed all day
  (`hours.kitchen` has no window for that weekday) is shown struck-through and
  disabled. Changing the day keeps the time if that slot is still valid,
  otherwise moves to the day's first valid slot.
- `TimePicker`: 30-minute slot chips from the day's opening window(s)
  (`hours.kitchen` for that weekday; when hours are unconfigured, 08:00–22:00),
  for today starting at the first slot ≥ 40 minutes from now. Slots wrap in
  rows. If the day has no remaining slot the picker says "Nothing left today —
  pick another day" and the date strip is what the customer uses. The default
  selection is the first available slot of the first available day, which
  replaces `defaultNeededOnLocal`'s "40 minutes from now" only in that it
  snaps to the slot grid.
- The server-side hours check on order create is unchanged and remains the
  authority.

**Upsell — "Goes well with" (`UpsellStrip.tsx`).** Purely from the menu
payload already loaded on checkout. Rules, applied in order until 4
suggestions are found, skipping anything already in the cart, unavailable, or
in a closed category:

1. cart has a Main Course (cat 12) and no bread (13, 14) → up to 2 breads
   (first by `sort_order`: Butter Naan, Tandoori Roti…);
2. cart has a Main Course and no rice (15) → 1 rice;
3. cart has a Starter/Tandoori Starter (7, 8) or Chinese (9) and no Main
   Course → 1 Main Course;
4. no Salad (16) → 1 salad;
5. fill the remainder with the cheapest items from categories not yet in the
   cart.

Category ids are looked up by name at runtime ("Main Course", "Tandoori
Breads", "Tawa Breads", "Rice and Biryani", "Starters", "Tandoori Starters",
"Fried Rice and Noodles", "Salads") so a renumbered menu degrades to rule 5
rather than breaking. Each suggestion is a compact card: photo (if any),
name, price, **+ Add** — items with options open `ItemPickerModal`. The strip
hides when it finds nothing.

### What does not change

- Prices remain tax-exclusive; `computeGst` / `compute_gst` untouched.
- Snapshot text columns (`variant_name`, `addons_text`) keep their meaning, so
  receipts, kitchen tickets, WhatsApp slips and the print page are untouched.
- The address picker, PIN gate, review flow and push nudges are untouched.
- Add-ons stay checkboxes.

## Verification

- `scripts/verify-cumulative-migration.php`, `scripts/verify-install-file.php`
  — migration 015 present in both files and idempotent.
- `scripts/verify-order-lines.php` (new, throwaway DB): an item with two
  groups → missing a group is refused with the group's label; both chosen →
  price and `variant_ids`/`variant_name` snapshot correct; legacy
  `variant_id` still accepted; a variant from another item refused.
- `scripts/verify-menu-snapshot.php` — regenerated snapshot includes
  `group_label` and the Vegetables group.
- `web/scripts/verify-cart.mjs` (new): `cartKey` stability with two variant
  ids in any order; `linePrice` with two deltas; `groupVariants` ordering and
  default selection.
- `web/scripts/verify-time-slots.mjs` (new): slot generation for a weekday
  with one window, two windows, none; today's cut-off; the 40-minute floor.
- `web/scripts/verify-upsell.mjs` (new): each rule fires and skips cart /
  unavailable / closed items; the cap of 4.
- `npm run build` for both apps; the Android bundle built and installed;
  browser-pane checks of `/order` at 375 px (FAB, See more modal) and 1280 px
  (open cart panel), `/checkout` at both widths.

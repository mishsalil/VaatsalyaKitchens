# Menu, cart and checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Variants grouped under kitchen-chosen labels (several radio groups per dish), a dish-detail modal behind "…See more", a floating cart button (open cart panel on wide screens), and a checkout that edits the cart, picks date and time separately, upsells, and no longer mentions GST.

**Architecture:** One migration (015) adds `menu_item_variants.group_label` and `order_items.variant_ids`. Variant validation moves into a single PHP function in `includes/order_lines.php` used by both the customer and counter order routes. The client cart line grows from one `variant` to `variants[]`; the storage key changes so stale carts are dropped. New storefront components (`DishDetailModal`, `CartFab`, `CartPanel`, `CartLines`, `DatePicker`, `TimePicker`, `UpsellStrip`) are pure UI over data the menu payload already carries; their logic lives in small `shared/lib` modules verified by esbuild-transform scripts.

**Tech Stack:** PHP 8.2 / MariaDB (XAMPP at `C:\xampp\php\php.exe`, `C:\xampp\mysql\bin\mysql.exe`, DB `vaatsalya_kitchens`), React 18 + TypeScript + Vite + Tailwind, `web/scripts/*.mjs` via esbuild transform, `scripts/verify-*.php` throwaway-DB scripts, Capacitor 8 Android.

**Spec:** `docs/superpowers/specs/2026-09-12-menu-cart-checkout-design.md`

## Global Constraints

- Prices remain tax-exclusive; `computeGst` / `compute_gst` / `compute_order_total` are not touched.
- `order_items.variant_name` and `addons_text` keep their meaning (joined display text); receipts, kitchen tickets, WhatsApp slips and the print page are not edited.
- `order_items.variant_id` stays in the schema; new orders write `variant_ids` and leave `variant_id` NULL; readers use `variant_ids ?? variant_id`.
- A posted line may still carry `variant_id` (old app builds); it is treated as `variant_ids: [variant_id]`.
- Default group label is exactly `Preparation`; label max 40 chars. The Deluxe Chinese Combo's 15 rows become `Combination`; the Vegetables group is `Vegetables` with `With Vegetables` (default, ₹0) and `Without Vegetables` (₹0).
- Error text when a group is not chosen: `Please choose <label> for <item>.`
- Cart localStorage key becomes `vk-cart-v2`; a `vk-cart` value is ignored (never migrated).
- Cart FAB: 56 px round, bottom-right, `right-4`, above the mobile tab bar; hidden when the cart is empty, while the sheet is open, on `/checkout`, and at `lg+` on `/order`.
- `/order` at `lg+`: `lg:grid-cols-[13rem_1fr_20rem]`; the cart panel is sticky and never collapses when empty.
- Checkout at `md+`: `md:grid-cols-[1fr_24rem]`; cards `p-6`, form `space-y-6`.
- Time slots: 30 minutes; today's first slot ≥ 40 minutes from now; unconfigured hours mean 08:00–22:00; a fully closed day is struck through and disabled; empty day text: `Nothing left today — pick another day`.
- Upsell: at most 4 cards; rule order exactly as in the spec; category ids resolved by name at runtime; hidden when empty; title `Goes well with`.
- Checkout bill note: comp → `This order is on us — nothing to pay.`; otherwise `Final price is confirmed by us on the phone — delivery charges may apply.` The GST sentence is deleted from both `BillDetails.tsx` and `CartSheet.tsx`.
- Every migration change lands in three places: `database/migration_015_variant_groups.sql`, the guarded block + verification rows in `database/migrate_production.sql`, and `database/install_fresh.sql`; `php scripts/verify-cumulative-migration.php` and `php scripts/verify-install-file.php` must pass.
- Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Run PHP as `C:/xampp/php/php.exe`; the local MySQL must be running (`C:\xampp\mysql\bin\mysqld --standalone --console` in the background if `mysql -u root -e "select 1"` fails).
- Work on branch `feat/menu-cart-checkout` off `main`.

---

## File map

| File | Responsibility |
|---|---|
| `database/migration_015_variant_groups.sql` (new) | the two ALTERs |
| `database/migrate_production.sql`, `database/install_fresh.sql` | guarded copies + verification rows |
| `includes/order_lines.php` | `resolve_item_variants()` — the one place variant choice is validated and snapshotted; `insert_order_lines` writes `variant_ids` |
| `api/routes/orders.php`, `api/routes/admin/orders.php` | call `resolve_item_variants()`; `show` returns `variant_ids` |
| `api/routes/menu.php`, `api/routes/admin/menu.php` | `group_label` in payloads, saves, CSV cells |
| `scripts/export-menu-sql.php`, `database/menu_snapshot.sql`, `database/menu_options.sql` | data: Combination + Vegetables groups |
| `scripts/verify-order-lines.php` (new) | throwaway-DB proof of the resolver |
| `web/src/apps/shared/types/index.ts` | `MenuVariant.group_label`, `CartLine.variants`, `cartKey`, `linePrice`, `groupVariants`, `variantsText` |
| `web/src/apps/shared/context/CartContext.tsx` | `variants[]` in `AddSpec`, key `vk-cart-v2` |
| `web/scripts/verify-cart.mjs` (new) | proof of the type helpers |
| `web/src/apps/storefront/components/ItemPickerModal.tsx` | one radio fieldset per group |
| `web/src/apps/storefront/components/DishDetailModal.tsx` (new), `MenuItemRow.tsx` | "…See more" |
| `web/src/apps/storefront/components/CartLines.tsx` (new) | shared line rows with stepper + delete |
| `web/src/apps/storefront/components/CartFab.tsx` (new), `CartPanel.tsx` (new), `CartSheet.tsx`, `CartBar.tsx` (deleted) | cart surfaces |
| `web/src/apps/storefront/layout/CustomerLayout.tsx`, `pages/Order.tsx` | mount FAB / panel |
| `web/src/apps/shared/lib/timeSlots.ts` (new), `web/scripts/verify-time-slots.mjs` (new) | slot maths |
| `web/src/apps/storefront/components/DatePicker.tsx` (new), `TimePicker.tsx` (new); `DateTimePicker.tsx` (deleted) | date / time UI |
| `web/src/apps/shared/lib/upsell.ts` (new), `web/scripts/verify-upsell.mjs` (new), `web/src/apps/storefront/components/UpsellStrip.tsx` (new) | "Goes well with" |
| `web/src/apps/storefront/components/BillDetails.tsx`, `pages/Checkout.tsx` | note removed; new layout |
| `web/src/apps/storefront/components/ReorderButton.tsx`, `OrderSummary.tsx` | `variants[]` |
| `web/src/apps/admin/pages/NewOrder.tsx`, `components/ItemFormModal.tsx`, `api/endpoints.ts`, `types.ts` | counter picker groups; Group field |
| `README.md` | Menu options section update |

---

### Task 1: Migration 015

**Files:**
- Create: `database/migration_015_variant_groups.sql`
- Modify: `database/migrate_production.sql` (after the migration_014 block, before VERIFICATION; plus two verification rows)
- Modify: `database/install_fresh.sql` (the `menu_item_variants` CREATE at ~line 435; a guarded ALTER for `order_items.variant_ids` next to the `addon_ids` one at ~line 502; a verification row)

**Interfaces:**
- Produces: columns `menu_item_variants.group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation'` and `order_items.variant_ids VARCHAR(255) NULL`.

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/menu-cart-checkout main
```

- [ ] **Step 2: Write the numbered migration**

`database/migration_015_variant_groups.sql`:

```sql
-- migration_015_variant_groups.sql — variants belong to a labelled group.
--
-- A dish can carry several radio groups (Preparation: Ghee/Butter; Vegetables:
-- With/Without). Rows sharing a group_label are one radio; a customer picks one
-- per group. Existing rows become "Preparation", which is what they were.
--
-- order_items.variant_ids holds the chosen ids joined by "," (like addon_ids).
-- variant_id stays for orders written before this; readers prefer variant_ids.

ALTER TABLE menu_item_variants ADD COLUMN group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation' AFTER item_id;
ALTER TABLE order_items ADD COLUMN variant_ids VARCHAR(255) NULL AFTER variant_id;
```

- [ ] **Step 3: Add the guarded block to `migrate_production.sql`**

Insert directly after the migration_014 block (after its `PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;`):

```sql


-- --- migration_015: variant groups ------------------------------------------
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE menu_item_variants ADD COLUMN group_label VARCHAR(40) NOT NULL DEFAULT ''Preparation'' AFTER item_id')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='menu_item_variants' AND COLUMN_NAME='group_label');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN variant_ids VARCHAR(255) NULL AFTER variant_id')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_ids');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
```

Then change the last verification line (`UNION ALL SELECT 'menu_items.description', … COLUMN_NAME='description';`) to drop its trailing `;` and append:

```sql
UNION ALL SELECT 'menu_item_variants.group_label', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_item_variants' AND COLUMN_NAME='group_label'
UNION ALL SELECT 'order_items.variant_ids', IF(COUNT(*)=1,'OK','MISSING') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_ids';
```

- [ ] **Step 4: Mirror in `install_fresh.sql`**

In the `CREATE TABLE IF NOT EXISTS menu_item_variants` block add, after `item_id INT UNSIGNED NOT NULL,`:

```sql
  group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation',
```

After the guarded `addon_ids` ALTER (~line 502–504) add:

```sql
SET @s := (SELECT IF(COUNT(*) > 0, 'DO 0', 'ALTER TABLE order_items ADD COLUMN variant_ids VARCHAR(255) NULL AFTER variant_id')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='variant_ids');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
```

And append the same two verification rows to its verification SELECT (the file's last statement; move the `;`).

- [ ] **Step 5: Run the verifiers and apply locally**

```bash
C:/xampp/php/php.exe scripts/verify-cumulative-migration.php
C:/xampp/php/php.exe scripts/verify-install-file.php
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens < database/migration_015_variant_groups.sql
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens -e "SHOW COLUMNS FROM menu_item_variants LIKE 'group_label'; SHOW COLUMNS FROM order_items LIKE 'variant_ids'"
```

Expected: both verifiers end with their pass line and exit 0; both SHOW COLUMNS return one row.

- [ ] **Step 6: Commit**

```bash
git add database/migration_015_variant_groups.sql database/migrate_production.sql database/install_fresh.sql
git commit -m "feat(db): migration 015 — variant groups and order_items.variant_ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `resolve_item_variants()` — the one resolver

**Files:**
- Modify: `includes/order_lines.php`
- Modify: `api/routes/orders.php:105-122` (inline variant block) and `api/routes/admin/orders.php:40-54` (`resolve_order_lines`)
- Modify: `api/routes/admin/orders.php:199-211` (`show` — return `variant_ids`)
- Create: `scripts/verify-order-lines.php`

**Interfaces:**
- Produces:
  ```php
  /** @return array{delta: float, name: ?string, ids: ?string}  — throws via Response::error */
  function resolve_item_variants(PDO $pdo, int $itemId, string $itemName, array $posted): array
  ```
  `$posted` is the raw line (`variant_ids` array and/or legacy `variant_id`). Returns the summed delta, the joined names in group order (or null when the item has no variants), and the ids joined by "," (or null).
- `insert_order_lines` reads `$line['variant_ids']` (string|null).

- [ ] **Step 1: Write the failing verification script**

`scripts/verify-order-lines.php`:

```php
<?php
/* Variant groups at order time: exactly one choice per group, ids must belong
   to the item, legacy variant_id still accepted. Throwaway DB, dropped at end.
   Response::error() is stubbed to throw so a refusal is an assertable value. */

chdir(__DIR__ . '/..');
require 'includes/db.php';

class VerifyRefused extends RuntimeException {}
if (!class_exists('Response')) {
    class Response {
        public static function error(string $msg, int $code = 422): void { throw new VerifyRefused($msg); }
        public static function json($d, int $c = 200): void {}
    }
}
require 'includes/order_lines.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n",
        $what, var_export($expected, true), var_export($actual, true)); }
}
function refused(callable $fn): ?string {
    try { $fn(); return null; } catch (VerifyRefused $e) { return $e->getMessage(); }
}

$pdo = db();
$dbName = 'vk_verify_lines_' . getmypid();
$pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
$pdo->exec("CREATE DATABASE `$dbName` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$dbName`");
$pdo->exec("CREATE TABLE menu_item_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT, item_id INT UNSIGNED NOT NULL,
  group_label VARCHAR(40) NOT NULL DEFAULT 'Preparation', name VARCHAR(80) NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0, is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0, PRIMARY KEY (id))");
// item 1: Preparation (Normal +0 default, Ghee +20) and Vegetables (With +0 default, Without +0)
$pdo->exec("INSERT INTO menu_item_variants (id,item_id,group_label,name,price_delta,is_default,sort_order) VALUES
  (11,1,'Preparation','Normal',0,1,0),(12,1,'Preparation','Ghee',20,0,1),
  (13,1,'Vegetables','With Vegetables',0,1,2),(14,1,'Vegetables','Without Vegetables',0,0,3),
  (21,2,'Preparation','Half',-50,1,0),(22,2,'Preparation','Full',0,0,1)");

try {
    echo "an item with no variants\n";
    $r = resolve_item_variants($pdo, 9, 'Plain Rice', []);
    check('no delta',  0.0,  $r['delta']);
    check('no name',   null, $r['name']);
    check('no ids',    null, $r['ids']);

    echo "\nboth groups chosen\n";
    $r = resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [14, 12]]);
    check('delta is the sum',           20.0,                       $r['delta']);
    check('names in group order',       'Ghee, Without Vegetables', $r['name']);
    check('ids in group order',         '12,14',                    $r['ids']);

    echo "\none group missing\n";
    check('names the missing group', 'Please choose Vegetables for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [12]])));
    check('nothing chosen names the first group', 'Please choose Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', [])));

    echo "\ntwo choices from one group\n";
    check('refused', 'Please choose one Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [11, 12, 13]])));

    echo "\na variant from another item\n";
    check('ignored, so the group reads as missing', 'Please choose Preparation for Veg Noodles.',
        refused(fn() => resolve_item_variants($pdo, 1, 'Veg Noodles', ['variant_ids' => [21, 13]])));

    echo "\nlegacy variant_id\n";
    $r = resolve_item_variants($pdo, 2, 'Dal', ['variant_id' => 21]);
    check('delta', -50.0, $r['delta']);
    check('name',  'Half', $r['name']);
    check('ids',   '21',   $r['ids']);
    $r = resolve_item_variants($pdo, 2, 'Dal', ['variant_id' => 22, 'variant_ids' => [21]]);
    check('variant_ids wins over variant_id', '21', $r['ids']);
} finally {
    $pdo->exec("DROP DATABASE IF EXISTS `$dbName`");
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to see it fail**

Run: `C:/xampp/php/php.exe scripts/verify-order-lines.php`
Expected: fatal `Call to undefined function resolve_item_variants()`.

- [ ] **Step 3: Implement in `includes/order_lines.php`**

Add above `insert_order_lines`:

```php
/**
 * Validate a line's variant choice against the item's groups and snapshot it.
 * Groups are the distinct group_label values on the item, in order of their
 * first row (sort_order, id). Exactly one chosen id per group; ids that do not
 * belong to the item are ignored. A legacy `variant_id` (older app builds) is
 * read as a one-element list when `variant_ids` is absent.
 *
 * @return array{delta: float, name: ?string, ids: ?string}
 */
function resolve_item_variants(PDO $pdo, int $itemId, string $itemName, array $posted): array
{
    static $stmt = null;
    if ($stmt === null || $stmt->queryString === '') {
        $stmt = $pdo->prepare(
            'SELECT id, group_label, name, price_delta FROM menu_item_variants WHERE item_id = ? ORDER BY sort_order, id'
        );
    }
    $stmt->execute([$itemId]);
    $rows = $stmt->fetchAll();
    if (!$rows) {
        return ['delta' => 0.0, 'name' => null, 'ids' => null];
    }

    $posted_ids = isset($posted['variant_ids']) && is_array($posted['variant_ids'])
        ? array_map('intval', $posted['variant_ids'])
        : ((int)($posted['variant_id'] ?? 0) > 0 ? [(int)$posted['variant_id']] : []);

    $groups = [];               // label => list of rows, in first-seen order
    foreach ($rows as $r) {
        $groups[$r['group_label']][] = $r;
    }

    $delta = 0.0; $names = []; $ids = [];
    foreach ($groups as $label => $options) {
        $chosen = [];
        foreach ($options as $o) {
            if (in_array((int)$o['id'], $posted_ids, true)) $chosen[] = $o;
        }
        if (count($chosen) > 1) {
            Response::error("Please choose one $label for $itemName.");
        }
        if (!$chosen) {
            Response::error("Please choose $label for $itemName.");
        }
        $delta  += (float)$chosen[0]['price_delta'];
        $names[] = $chosen[0]['name'];
        $ids[]   = (int)$chosen[0]['id'];
    }
    return ['delta' => $delta, 'name' => implode(', ', $names), 'ids' => implode(',', $ids)];
}
```

(The `static $stmt` cache is per-process and the PDO is the same one; if `$pdo` could differ between calls in tests, prepare each call instead — simpler and fine: drop the static and just `$pdo->prepare(...)` every time. Use the simple form.)

Then in `insert_order_lines`, change the INSERT to write `variant_ids`:

```php
    $stmt = $pdo->prepare(
        'INSERT INTO order_items
            (order_id, menu_item_id, variant_id, variant_ids, addon_ids,
             item_name, variant_name, addons_text, unit, price, qty)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($lines as $line) {
        $stmt->execute([
            $orderId,
            $line['menu_item_id'] ?? null,
            $line['variant_ids'] ?? null,
            $line['addon_ids'] ?? null,
            $line['name'],
            $line['variant_name'],
            $line['addons_text'],
            $line['unit'],
            $line['price'],
            $line['qty'],
        ]);
    }
```

and update the docblock list to `menu_item_id, variant_ids, addon_ids`.

- [ ] **Step 4: Run the script**

Run: `C:/xampp/php/php.exe scripts/verify-order-lines.php`
Expected: `14 passed, 0 failed`.

- [ ] **Step 5: Use it in the customer route**

In `api/routes/orders.php`, replace the block from `// Variants: if the item has any, a valid variant_id is required.` through `$variantName = $chosen['name']; }` (lines ~105–122) with:

```php
            // Variants: one choice per group, validated and snapshotted in one place.
            $vr = resolve_item_variants($pdo, $id, $menuItem['name'], $it);
            $unit = $base + $vr['delta'];
            $variantName = $vr['name'];
```

Delete the now-unused `$variantStmt` prepare above the loop. In the `$lines[]` array replace `'variant_id' => $variantId ?: null,` with `'variant_ids' => $vr['ids'],`. Make sure `require_once __DIR__ . '/../../includes/order_lines.php';` is at the top (it already is if `insert_order_lines` is used there; check with grep).

- [ ] **Step 6: Use it in the counter route**

In `api/routes/admin/orders.php` `resolve_order_lines`, replace lines from `$variantStmt->execute([$id]);` through `$variantName = $chosen['name']; }` with:

```php
        $vr = resolve_item_variants($pdo, $id, $menuItem['name'], $it);
        $unit += $vr['delta'];
        $variantName = $vr['name'];
```

Delete the `$variantStmt` prepare; in the `$lines[]` array replace `'variant_id' => $variantId ?: null,` with `'variant_ids' => $vr['ids'],`.

In `show`, change the SELECT to `SELECT menu_item_id, variant_id, variant_ids, addon_ids, item_name, …` and after the `variant_id` cast add:

```php
            // New orders carry the list; older ones only the single id.
            $it['variant_ids'] = $it['variant_ids']
                ? array_map('intval', explode(',', $it['variant_ids']))
                : ($it['variant_id'] !== null ? [$it['variant_id']] : []);
```

- [ ] **Step 7: Smoke both routes against the local DB**

Start the API if not running (`C:/xampp/php/php.exe -S 127.0.0.1:8000 -t . api/index.php` or however `local-dev-stack` memory says), then:

```bash
curl -s -X POST http://127.0.0.1:8000/api/orders -H 'Content-Type: application/json' -d '{"name":"T","phone":"9876543210","needed_on":"x","needed_at":"2026-09-13 19:00:00","items":[{"id":132,"qty":1}]}'
```

Expected: 422 with `Please choose Preparation for Deluxe Chinese Combo.` (group is still "Preparation" until Task 4 renames it). Then the same call with `"variant_ids":[<one of its variant ids>]` returns `order_id`; `SELECT variant_ids, variant_name FROM order_items ORDER BY id DESC LIMIT 1` shows the id and the name. Delete that test order afterwards (`DELETE FROM orders WHERE id = <that id>` — only that id).

- [ ] **Step 8: Commit**

```bash
git add includes/order_lines.php api/routes/orders.php api/routes/admin/orders.php scripts/verify-order-lines.php
git commit -m "feat(orders): one resolver for variant groups, used by web and counter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `group_label` through the menu APIs, CSV and admin item editor

**Files:**
- Modify: `api/routes/menu.php:38-52`
- Modify: `api/routes/admin/menu.php` — list (~60–70), CSV export (~114–135), import (~196, 261), `save_item_options` (~603–625), `parse_variants_cell` (~699), `format_variants_cell` (~754), docblock line 3–17
- Modify: `scripts/export-menu-sql.php:24` (and add `description` to `menu_items` — the snapshot predates migration 014 and would otherwise wipe descriptions when replayed)
- Modify: `web/src/apps/admin/types.ts:130-137`, `web/src/apps/admin/api/endpoints.ts` (`AdminVariantInput`), `web/src/apps/admin/components/ItemFormModal.tsx`, `web/src/apps/shared/lib/sampleCsv.ts`

**Interfaces:**
- Produces: public and admin menu variants carry `group_label: string`; `POST admin/menu/add_item|update_item` accept `variants[i].group_label`; CSV variants cell format `Preparation=Normal:*0|Ghee:+20|Vegetables=With Vegetables:*0|Without Vegetables:0` (a `Label=` prefix starts a new group; segments without one continue the current group; the first group defaults to `Preparation`).

- [ ] **Step 1: Public menu**

In `api/routes/menu.php` add `group_label` to the variants SELECT and to the array: `'group_label' => $v['group_label'],` after `'name'`.

- [ ] **Step 2: Admin list**

Same change at `api/routes/admin/menu.php` ~line 60 (SELECT) and the array built from it.

- [ ] **Step 3: `save_item_options` — per-group default**

Replace the variants half:

```php
    $insV = $db->prepare(
        'INSERT INTO menu_item_variants (item_id, group_label, name, price_delta, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $seenDefault = [];          // group_label => true once a default is written
    foreach (($variants ?? []) as $i => $v) {
        $name = mb_substr(trim((string)($v['name'] ?? '')), 0, 80);
        if ($name === '') {
            continue;
        }
        $group = mb_substr(trim((string)($v['group_label'] ?? '')), 0, 40);
        if ($group === '') {
            $group = 'Preparation';
        }
        $delta = parse_delta($v['price_delta'] ?? 0);
        if ($delta === null) {
            $delta = 0.0;
        }
        $isDefault = empty($seenDefault[$group]) && !empty($v['is_default']);
        if ($isDefault) {
            $seenDefault[$group] = true;
        }
        $insV->execute([$itemId, $group, $name, $delta, $isDefault ? 1 : 0, (int)$i]);
    }
```

Update its docblock: "at most one default per group".

- [ ] **Step 4: CSV cell parse/format**

`parse_variants_cell`: track `$group = 'Preparation'`; for each segment, if it contains `=` before any `:`, split: `[$group, $seg] = explode('=', $seg, 2)` (trim both; empty label → keep previous). Add `'group_label' => $group` to each output row.

`format_variants_cell`: iterate keeping `$cur = null`; when `$v['group_label'] !== $cur`, prefix the segment with `$v['group_label'] . '='` and set `$cur`. Output for a Preparation-only item therefore begins `Preparation=Half:-70|Full:*+150` — update the format comment on both functions and the docblock at the top of the file (line 99's column comment too).

Export SELECT at ~114 adds `group_label`; import passes the parsed rows (already includes `group_label`) to `save_item_options`.

- [ ] **Step 5: `scripts/export-menu-sql.php`**

```php
    'menu_items'         => ['id', 'category_id', 'subcategory_id', 'name', 'description', 'price', 'unit', 'available', 'sort_order', 'branch_id'],
    'menu_item_variants' => ['id', 'item_id', 'group_label', 'name', 'price_delta', 'is_default', 'sort_order'],
```

- [ ] **Step 6: Admin client types + form**

`types.ts` `AdminItemVariant`: add `group_label: string;` after `name`. `endpoints.ts` `AdminVariantInput`: add `group_label: string;`.

`ItemFormModal.tsx`:
- `VariantRow` gains `group: string`.
- `addVariant`: `{ name: '', delta: '0', isDefault: false, group: prev[prev.length - 1]?.group ?? 'Preparation' }` (a new row joins the last group; the default is whichever row the user marks — see below).
- Hydration from `item.variants`: `group: v.group_label`.
- Default radio: replace the single `name="variant-default"` radio with one radio group **per group label**: `name={\`variant-default-${v.group}\`}`, and `setDefaultVariant(i)` marks row `i` default and clears `isDefault` only on rows with the same `group`.
- Each row gets a Group input before the name: `<Input list="variant-groups" value={v.group} maxLength={40} placeholder="Preparation" onChange={(e) => updateVariant(i, { group: e.target.value })} className="w-32" />` and once, outside the map: `<datalist id="variant-groups">{[...new Set(allGroups)].map((g) => <option key={g} value={g} />)}</datalist>` where `allGroups` comes from a new prop `knownGroups: string[]` passed by `MenuManager` (collect `it.variants.map(v => v.group_label)` over all items).
- Section heading "Sizes / variants" → "Variants"; helper text → "Rows with the same group name form one choice (e.g. Preparation: Ghee / Butter). Mark one default per group."
- Payload: `group_label: v.group.trim() || 'Preparation'`.
- Guarantee one default per group before submit: for each distinct group with no default, set the first row of that group `is_default = true`.

`sampleCsv.ts`: variants examples become `Preparation=Half:-70|Full:*+150` (and the header comment).

- [ ] **Step 7: Verify**

```bash
cd web && npx tsc --noEmit -p . && cd ..
C:/xampp/php/php.exe -l api/routes/admin/menu.php
```

Then in the browser pane (admin at the local Vite URL), open Menu → edit "Methi Matar Malai" → each row shows Group "Preparation"; add a row with Group "Vegetables" → save → reopen: groups persisted; CSV export contains `Preparation=Normal:*+0|Ghee:+20|…`.

- [ ] **Step 8: Commit**

```bash
git add api/routes/menu.php api/routes/admin/menu.php scripts/export-menu-sql.php web/src/apps/admin web/src/apps/shared/lib/sampleCsv.ts
git commit -m "feat(menu): variant group labels in the API, CSV and the item editor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Data — Combination and Vegetables groups, regenerated snapshot

**Files:**
- Modify: `database/menu_options.sql` (append a section)
- Regenerate: `database/menu_snapshot.sql`
- Verify: `scripts/verify-menu-snapshot.php` (add one check)

- [ ] **Step 1: Append to `menu_options.sql`**

```sql

-- ---------------------------------------------------------------------------
-- 015 — groups. Run after migration_015.
-- The combo's 15 rows are a "Combination"; Chinese dishes get a Vegetables
-- radio in place of the "Without Vegetables" add-on.
-- ---------------------------------------------------------------------------
UPDATE menu_item_variants v JOIN menu_items i ON i.id = v.item_id
   SET v.group_label = 'Combination'
 WHERE i.name = 'Deluxe Chinese Combo';

DELETE a FROM menu_item_addons a WHERE a.name = 'Without Vegetables';

DELETE v FROM menu_item_variants v WHERE v.group_label = 'Vegetables';
INSERT INTO menu_item_variants (item_id, group_label, name, price_delta, is_default, sort_order)
SELECT id, 'Vegetables', 'With Vegetables', 0.00, 1, 100 FROM menu_items
 WHERE category_id = 9 OR name IN ('Chinese Combo Meal', 'Deluxe Chinese Combo');
INSERT INTO menu_item_variants (item_id, group_label, name, price_delta, is_default, sort_order)
SELECT id, 'Vegetables', 'Without Vegetables', 0.00, 0, 101 FROM menu_items
 WHERE category_id = 9 OR name IN ('Chinese Combo Meal', 'Deluxe Chinese Combo');
```

(`sort_order 100/101` keeps Vegetables after any Preparation/Combination rows.)

- [ ] **Step 2: Apply locally and regenerate the snapshot**

```bash
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens < database/menu_options.sql
C:/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens -e "SELECT group_label, COUNT(*) FROM menu_item_variants GROUP BY group_label; SELECT COUNT(*) FROM menu_item_addons WHERE name='Without Vegetables'"
C:/xampp/php/php.exe scripts/export-menu-sql.php > database/menu_snapshot.sql
```

Expected: `Combination 15`, `Vegetables 2×N` (N = category-9 dishes + 2 combos), `Preparation` the rest; add-on count 0.

- [ ] **Step 3: Extend `verify-menu-snapshot.php`**

After its existing checks add:

```php
$n = (int)$pdo->query("SELECT COUNT(DISTINCT item_id) FROM menu_item_variants WHERE group_label = 'Vegetables'")->fetchColumn();
check('Vegetables group present on Chinese dishes', true, $n > 0);
$d = $pdo->query("SELECT COUNT(*) FROM menu_items WHERE description IS NOT NULL AND description <> ''")->fetchColumn();
check('descriptions survive the snapshot', true, (int)$d > 0);
```

(Use the script's own `check` helper name/signature — read it first.)

Run: `C:/xampp/php/php.exe scripts/verify-menu-snapshot.php` → all pass.

- [ ] **Step 4: Commit**

```bash
git add database/menu_options.sql database/menu_snapshot.sql scripts/verify-menu-snapshot.php
git commit -m "data(menu): Combination and Vegetables variant groups; snapshot carries descriptions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Client cart types — `variants[]`

**Files:**
- Modify: `web/src/apps/shared/types/index.ts:88-165`
- Modify: `web/src/apps/shared/context/CartContext.tsx`
- Create: `web/scripts/verify-cart.mjs`

**Interfaces:**
- Produces (all exported from `shared/types`):
  ```ts
  interface MenuVariant { id; name; group_label: string; price_delta; is_default; sort_order }
  interface CartLine { key; id; name; unit; basePrice; variants: CartVariant[]; addons: CartAddon[]; qty }
  function cartKey(id: number, variantIds: number[] = [], addonIds: number[] = []): string
  function linePrice(l: CartLine): number
  function variantsText(vs: { name: string }[]): string | undefined   // "Ghee, Without Vegetables" or undefined
  function lineLabel(name, variantsText?, addonsText?): string          // unchanged
  interface VariantGroup { label: string; options: MenuVariant[]; defaultId: number }
  function groupVariants(variants: MenuVariant[]): VariantGroup[]
  ```
- `AddSpec.variants?: CartVariant[]` (the old `variant` field is removed).

- [ ] **Step 1: Write the failing script**

`web/scripts/verify-cart.mjs`:

```js
/** Cart helpers with several variant groups: stable keys, summed deltas, grouping. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/types/index.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { cartKey, linePrice, variantsText, groupVariants } =
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

console.log('cartKey');
check('no options', '7::::', cartKey(7));
check('variant ids sorted', '7::3,12::', cartKey(7, [12, 3]));
check('same key regardless of order', cartKey(7, [3, 12], [9, 4]), cartKey(7, [12, 3], [4, 9]));
check('zero ids dropped', '7::5::', cartKey(7, [0, 5]));

console.log('\nlinePrice');
const line = { key: 'k', id: 1, name: 'Veg Noodles', unit: '', basePrice: 200,
  variants: [{ id: 12, name: 'Ghee', priceDelta: 20 }, { id: 14, name: 'Without Vegetables', priceDelta: 0 }],
  addons: [{ id: 30, name: 'Extra Cheese', price: 20 }], qty: 2 };
check('base + deltas + addons', 240, linePrice(line));
check('no variants', 200, linePrice({ ...line, variants: [], addons: [] }));

console.log('\nvariantsText');
check('joined', 'Ghee, Without Vegetables', variantsText(line.variants));
check('empty is undefined', undefined, variantsText([]));

console.log('\ngroupVariants');
const vs = [
  { id: 13, name: 'With Vegetables', group_label: 'Vegetables', price_delta: 0, is_default: true, sort_order: 100 },
  { id: 11, name: 'Normal', group_label: 'Preparation', price_delta: 0, is_default: false, sort_order: 0 },
  { id: 12, name: 'Ghee', group_label: 'Preparation', price_delta: 20, is_default: false, sort_order: 1 },
  { id: 14, name: 'Without Vegetables', group_label: 'Vegetables', price_delta: 0, is_default: false, sort_order: 101 },
];
const g = groupVariants(vs);
check('groups ordered by first row', ['Preparation', 'Vegetables'], g.map((x) => x.label));
check('options in sort order', [11, 12], g[0].options.map((o) => o.id));
check('default is the marked row', 13, g[1].defaultId);
check('no marked default → first option', 11, g[0].defaultId);
check('none → empty', [], groupVariants([]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it**

Run: `cd web && node scripts/verify-cart.mjs`
Expected: failures (cartKey signature differs; `variantsText`/`groupVariants` undefined).

- [ ] **Step 3: Change the types**

In `shared/types/index.ts`:

```ts
export interface MenuVariant {
  id: number;
  name: string;
  /** Radio group this row belongs to ("Preparation", "Vegetables"…). One pick per group. */
  group_label: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

export interface CartLine {
  /** `${itemId}::${variantIds sorted}::${addonIds sorted}` — see cartKey. */
  key: string;
  id: number;
  name: string;
  unit: string;
  basePrice: number;
  /** One chosen variant per group the item has (empty when it has none). */
  variants: CartVariant[];
  addons: CartAddon[];
  qty: number;
}

export function linePrice(l: CartLine): number {
  return l.basePrice + l.variants.reduce((s, v) => s + v.priceDelta, 0) + l.addons.reduce((s, a) => s + a.price, 0);
}

const sortedIds = (ids: number[]) => [...ids].filter((n) => n > 0).sort((a, b) => a - b).join(',');

/** Stable cart key for one configuration of an item. */
export function cartKey(id: number, variantIds: number[] = [], addonIds: number[] = []): string {
  return `${id}::${sortedIds(variantIds)}::${sortedIds(addonIds)}`;
}

/** "Ghee, Without Vegetables" for the label; undefined when there are none. */
export function variantsText(vs: { name: string }[]): string | undefined {
  return vs.length ? vs.map((v) => v.name).join(', ') : undefined;
}

export interface VariantGroup {
  label: string;
  options: MenuVariant[];
  /** The is_default row, else the first option. */
  defaultId: number;
}

/** Split an item's flat variant list into its radio groups, in order of first appearance. */
export function groupVariants(variants: MenuVariant[]): VariantGroup[] {
  const sorted = [...variants].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const out: VariantGroup[] = [];
  for (const v of sorted) {
    let g = out.find((x) => x.label === v.group_label);
    if (!g) { g = { label: v.group_label, options: [], defaultId: v.id }; out.push(g); }
    g.options.push(v);
    if (v.is_default) g.defaultId = v.id;
  }
  return out;
}
```

`lineLabel` keeps its signature (rename its second param to `variantsText`). `OrderItem` is unchanged.

- [ ] **Step 4: CartContext**

- `STORAGE_KEY = 'vk-cart-v2'`.
- `AddSpec.variant?` → `variants?: CartVariant[]`.
- `load()`: drop the legacy migration; parse and keep only entries that have `key`, `id`, arrays `variants` and `addons` (else drop the entry).
- `add`: `const variants = spec.variants ?? []; const key = cartKey(spec.id, variants.map((v) => v.id), (spec.addons ?? []).map((a) => a.id));` and store `variants`.

- [ ] **Step 5: Run the script; type-check**

`node scripts/verify-cart.mjs` → `14 passed`. `npx tsc --noEmit -p .` will now list every consumer of `l.variant` — that is the worklist for Tasks 6 and 8 (do not fix them here beyond what the commit needs to compile: it will not compile yet; that is fine for this commit only if you commit together with Task 6. Preferred: do Task 6's mechanical edits now as part of this commit).

- [ ] **Step 6: Commit** (after Task 6 Step 1–3 if tsc demands it)

```bash
git add web/src/apps/shared/types/index.ts web/src/apps/shared/context/CartContext.tsx web/scripts/verify-cart.mjs
git commit -m "feat(cart): a line carries one variant per group; new storage key

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Consumers of `variants[]` — picker, sheet, checkout, reorder, counter

**Files:**
- Modify: `web/src/apps/storefront/components/ItemPickerModal.tsx`, `CartSheet.tsx:93`, `OrderSummary.tsx:24`, `ReorderButton.tsx:32-45`, `MenuItemRow.tsx:71`, `pages/Checkout.tsx:75,127`
- Modify: `web/src/apps/admin/pages/NewOrder.tsx`, `web/src/apps/admin/api/endpoints.ts:45-50`, `web/src/apps/admin/types.ts:219-223`

**Interfaces:**
- Consumes: `groupVariants`, `variantsText`, `cartKey(id, variantIds, addonIds)`, `AddSpec.variants`.
- Produces: order POST bodies carry `variant_ids: number[]` per line (customer `ordersApi.create`, admin `AdminNewOrderLine.variant_ids?: number[]`); `AdminOrderItem.variant_ids: number[]`.

- [ ] **Step 1: ItemPickerModal — one fieldset per group**

Replace the `defaultVariantId`/`variantId` state with:

```ts
const groups = useMemo(() => groupVariants(item.variants), [item.variants]);
const [choice, setChoice] = useState<Record<string, number>>({});   // group label → variant id
useEffect(() => {
  if (open) {
    setChoice(Object.fromEntries(groups.map((g) => [g.label, g.defaultId])));
    setAddonIds([]);
  }
}, [open, item.id, groups]);
const chosenVariants = groups.map((g) => g.options.find((o) => o.id === choice[g.label]) ?? g.options[0]);
const unitPrice = item.price + chosenVariants.reduce((s, v) => s + v.price_delta, 0) + chosenAddons.reduce((s, a) => s + a.price, 0);
```

Render `groups.map((g) => <fieldset key={g.label}> <legend …>{g.label}</legend> …options as today, checked = o.id === choice[g.label], onClick → setChoice((c) => ({ ...c, [g.label]: o.id })) …)`. The per-option price shows `+₹20` style deltas: `{o.price_delta === 0 ? '' : (o.price_delta > 0 ? '+' : '−') + rupees(Math.abs(o.price_delta))}` — with several groups an absolute price per option no longer makes sense. `confirm()` passes `variants: chosenVariants.map((v) => ({ id: v.id, name: v.name, priceDelta: v.price_delta }))`.

- [ ] **Step 2: Labels everywhere**

`CartSheet.tsx`, `OrderSummary.tsx`, `Checkout.tsx` (`billItems`): `lineLabel(l.name, variantsText(l.variants), l.addons.map((a) => a.name).join(', ') || undefined)`.

`Checkout.tsx` POST items: `variant_ids: l.variants.map((v) => v.id),` (remove `variant_id`).

`MenuItemRow.tsx:71`: `const groupCount = new Set(item.variants.map((v) => v.group_label)).size;` and show `${groupCount} choice${groupCount > 1 ? 's' : ''}` instead of "N sizes".

`ReorderButton.tsx`: rebuild variants from the snapshot text — split `it.variant_name` on ", " and match each name against `match.variants`; if the count of matches ≠ number of groups on the item, fall back to each group's default:

```ts
const groups = groupVariants(match.variants);
const wanted = it.variant_name ? it.variant_name.split(',').map((s) => s.trim()) : [];
const variants = groups.map((g) => g.options.find((o) => wanted.includes(o.name)) ?? g.options.find((o) => o.id === g.defaultId)!)
  .map((v) => ({ id: v.id, name: v.name, priceDelta: v.price_delta }));
```

- [ ] **Step 3: Admin types**

`endpoints.ts` `AdminNewOrderLine`: replace `variant_id?: number` with `variant_ids?: number[]`. `types.ts` `AdminOrderItem`: add `variant_ids: number[];` (keep `variant_id`).

- [ ] **Step 4: NewOrder — tiles by primary group, other groups as chips**

Principles (memory: counter speed): a tile per option of the **first** group only; every other group is preselected to its default and switchable by chips on the cart line, exactly like add-ons.

- `Tile`: replace `variantId/variantName` with `variantIds: number[]` and `variantLabel: string | null`.
- Tile building:
  ```ts
  const groups = groupVariants(it.variants);
  if (groups.length === 0) { push({ key: `${it.id}:0`, variantIds: [], variantLabel: null, price: it.price, … }) }
  else {
    const rest = groups.slice(1).map((g) => g.options.find((o) => o.id === g.defaultId)!);
    for (const o of groups[0].options) {
      const ids = [o.id, ...rest.map((r) => r.id)];
      push({ key: `${it.id}:${o.id}`, variantIds: ids, variantLabel: o.name,
             label: `${it.name} · ${o.name}`, price: it.price + o.price_delta + rest.reduce((s, r) => s + r.price_delta, 0), … });
    }
  }
  ```
- `CartEntry`: `variantIds: number[]` replaces `variantId/variantName`.
- `entryPrice`: sum deltas of `item.variants.filter((v) => e.variantIds.includes(v.id))`.
- `addTile`: `cartKey(t.itemId, t.variantIds, [])`, entry `{ itemId, variantIds: t.variantIds, addonIds: [], qty: 1 }`.
- New `setVariant(key, groupLabel, variantId)`: like `toggleAddon` — replace the id belonging to that group (`item.variants.filter(v => v.group_label === groupLabel).map(v => v.id)`) with `variantId`, re-key with `cartKey(e.itemId, nextIds, e.addonIds)`, merge on collision.
- Line render: name + ` · ${variantsText(chosen)}`; under it, for each group after the first, a chip row: one chip per option, filled when selected, `onClick={() => setVariant(key, g.label, o.id)}`; reuse the add-on chip classes.
- Edit prefill: `variantIds = line.variant_ids ?? []`; name-fallback branch (pre-007 orders) maps `line.variant_name.split(',')` names to ids as in ReorderButton; key via `cartKey(itemId, variantIds, addonIds)`.
- Payload: `...(entry.variantIds.length ? { variant_ids: entry.variantIds } : {})`.
- Tile badge count (line ~866): compare `e.variantIds[0] === t.variantIds[0]` (same primary option) — keep it simple and documented in a comment.

- [ ] **Step 5: Type-check and try it**

`cd web && npx tsc --noEmit -p .` → clean. Storefront: `/order` → Veg Noodles → picker shows **Vegetables** radio (With preselected); Methi Matar Malai shows **Preparation**; Deluxe Chinese Combo shows **Combination** then **Vegetables**; add → cart line reads "Deluxe Chinese Combo (Hakka Noodles x Veg Fried Rice, Without Vegetables)". Place a test order end-to-end; `SELECT variant_ids, variant_name FROM order_items ORDER BY id DESC LIMIT 1` shows two ids. Admin New Order: a Veg Noodles tile; its cart line shows With/Without chips; edit that same test order → chips reflect the saved choice. Delete only the test order(s) you created.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(storefront,admin): variant groups in the picker, cart, reorder and counter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: "…See more" and `DishDetailModal`

**Files:**
- Create: `web/src/apps/storefront/components/DishDetailModal.tsx`
- Modify: `web/src/apps/storefront/components/MenuItemRow.tsx`

**Interfaces:**
- Produces: `DishDetailModal({ item, open, onClose, unavailableUntil }: { item: MenuItem; open: boolean; onClose: () => void; unavailableUntil?: string | null })`.

- [ ] **Step 1: The modal**

```tsx
import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import type { MenuItem } from '../../shared/types';
import { ItemPickerModal } from './ItemPickerModal';

/**
 * The whole dish on a small screen: its photos, the full description and the
 * same Add control as the row. Opened from "…See more"; on wide screens the row
 * already shows everything, so it is never offered there.
 */
export function DishDetailModal({ item, open, onClose, unavailableUntil }: {
  item: MenuItem; open: boolean; onClose: () => void; unavailableUntil?: string | null;
}) {
  const { add } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const photos = item.photos ?? [];
  const hasOptions = item.variants.length > 0 || item.addons.length > 0;

  const onAdd = () => {
    if (hasOptions) { setPickerOpen(true); return; }
    add({ id: item.id, name: item.name, unit: item.unit, basePrice: item.price, qty: 1 });
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={item.name}
        footer={unavailableUntil
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-800"><Clock className="h-3 w-3" /> Available {unavailableUntil}</span>
          : <Button onClick={onAdd} fullWidth>{hasOptions ? 'Choose options' : `Add · ${rupees(item.price)}`}</Button>}>
        {photos.length > 0 && (
          <div>
            <div className="-mx-5 flex snap-x snap-mandatory overflow-x-auto"
                 onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
              {photos.map((src, i) => (
                <img key={src} src={src} alt={i === 0 ? item.name : ''} loading={i === 0 ? 'eager' : 'lazy'}
                     className="aspect-[4/3] w-full shrink-0 snap-center object-cover" />
              ))}
            </div>
            {photos.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
                {photos.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === slide ? 'bg-brand-900' : 'bg-cream-300'}`} />)}
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-sm text-brand-500">{hasOptions ? `from ${rupees(item.price)}` : rupees(item.price)}{item.unit ? ` · ${item.unit}` : ''}</p>
        {item.description && <p className="mt-2 whitespace-pre-line text-sm text-brand-800">{item.description}</p>}
      </Modal>
      {hasOptions && <ItemPickerModal item={item} open={pickerOpen} onClose={() => { setPickerOpen(false); onClose(); }} />}
    </>
  );
}
```

- [ ] **Step 2: The link in `MenuItemRow`**

Replace the description `<p>` with:

```tsx
{item.description && (
  <p className="mt-1 text-xs text-brand-500">
    <span ref={descRef} className="line-clamp-2 sm:line-clamp-none">{item.description}</span>
    {clamped && (
      <button type="button" onClick={() => setDetailOpen(true)} className="font-semibold text-brand-700 sm:hidden">…See more</button>
    )}
  </p>
)}
```

with

```ts
const descRef = useRef<HTMLSpanElement>(null);
const [clamped, setClamped] = useState(false);
const [detailOpen, setDetailOpen] = useState(false);
useEffect(() => {
  const el = descRef.current;
  if (!el) return;
  const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
  measure();
  window.addEventListener('resize', measure);
  return () => window.removeEventListener('resize', measure);
}, [item.description]);
```

and mount `<DishDetailModal item={item} open={detailOpen} onClose={() => setDetailOpen(false)} unavailableUntil={unavailableUntil} />` next to the picker. Make the `span` `display:block` (`block line-clamp-2`) so `scrollHeight` measures the clamp.

- [ ] **Step 3: Check in the browser pane at 375 px**

`resize_window` mobile → `/order`: a long description shows "…See more"; tap → modal with photo(s), full text, Add; Add on an options item opens the picker; a two-line description shows no link. At desktop width no link. (Note memory: the pane cannot test scroll — the gallery snap is checked on the phone in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add web/src/apps/storefront/components/DishDetailModal.tsx web/src/apps/storefront/components/MenuItemRow.tsx
git commit -m "feat(menu): …See more opens the dish's photos and full description

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Cart surfaces — `CartLines`, `CartFab`, `CartPanel`

**Files:**
- Create: `web/src/apps/storefront/components/CartLines.tsx`, `CartFab.tsx`, `CartPanel.tsx`
- Modify: `CartSheet.tsx` (use `CartLines`; delete the GST note), `pages/Order.tsx` (3-col + panel; remove `CartBar`), `layout/CustomerLayout.tsx` (mount `CartFab`)
- Delete: `CartBar.tsx`

**Interfaces:**
- Produces: `CartLines({ compact }: { compact?: boolean })` renders the cart's lines with stepper + delete from `useCart()`; `CartFab()` and `CartPanel()` take no props.

- [ ] **Step 1: `CartLines`**

Lift the `<ul>` from `CartSheet` verbatim into `CartLines.tsx` (label via `variantsText`), exporting `CartLines`; `compact` chooses `Stepper size="sm"`. `CartSheet` renders `<CartLines compact />` in place of its list. Delete the `<p className="text-xs text-brand-400">` GST/delivery note in the sheet footer entirely.

- [ ] **Step 2: `CartFab`**

```tsx
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { CartSheet } from './CartSheet';

/**
 * The cart as a floating button: bottom-right, above the tab bar, count on
 * its shoulder and the total in a pill beneath. Opens the CartSheet. Hidden
 * on checkout (the cart is on the page) and at lg+ on /order, where the open
 * CartPanel takes its place.
 */
export function CartFab() {
  const { count, total } = useCart();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (count === 0 || pathname === '/checkout') return null;
  const hideWide = pathname === '/order' ? 'lg:hidden' : '';
  return (
    <>
      {!open && (
        <div className={`fixed bottom-20 right-4 z-40 flex flex-col items-center gap-1 sm:bottom-6 ${hideWide}`}>
          <button type="button" onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-900 text-cream-50 shadow-bar transition-transform active:scale-95">
            <ShoppingBag className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-400 px-1.5 text-xs font-bold text-brand-900">{count}</span>
          </button>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-900 shadow-card">{rupees(total)}</span>
        </div>
      )}
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

(`bottom-20` clears the mobile tab bar, which the old bar cleared with `bottom-14` + its own height; adjust by eye at 375 px.)

- [ ] **Step 3: `CartPanel`**

```tsx
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../shared/context/CartContext';
import { useAuth } from '../../shared/hooks/useAuth';
import { rupees } from '../../shared/lib/format';
import { computeGst } from '../../shared/lib/gst';
import { CartLines } from './CartLines';

/** The always-open cart in /order's third column on wide screens. */
export function CartPanel() {
  const { lines, total, count } = useCart();
  const { settings } = useAuth();
  const navigate = useNavigate();
  const gst = computeGst(total, settings?.gst_rate);
  return (
    <aside className="sticky top-24 hidden self-start lg:block">
      <div className="card-soft p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Your cart</h2>
          {count > 0 && <span className="text-xs text-brand-400">{count} {count === 1 ? 'item' : 'items'}</span>}
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-brand-500">Your cart is empty — add dishes from the menu.</p>
        ) : (
          <>
            <div className="mt-2 max-h-[50vh] overflow-y-auto"><CartLines compact /></div>
            <div className="mt-3 flex items-center justify-between border-t border-cream-200 pt-3">
              <span className="text-sm font-semibold text-brand-700">Subtotal</span>
              <span className="text-lg font-bold text-brand-900">{rupees(total)}</span>
            </div>
            <button type="button" onClick={() => navigate('/checkout')}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-brand-900 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-brand-800">
              Checkout · {rupees(gst.total)}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Mount**

`Order.tsx`: browse grid becomes `lg:grid lg:grid-cols-[13rem_1fr_20rem] lg:gap-8` with `<CartPanel />` as the third child; the search-results branch wraps its list the same way (`lg:grid lg:grid-cols-[1fr_20rem]` + panel) so the cart does not vanish while searching. Remove `<CartBar />` and its import; delete `CartBar.tsx`.

`CustomerLayout.tsx`: render `<CartFab />` once, after `<main>` (inside the provider tree; `useCart` must resolve — check where `CartProvider` wraps).

- [ ] **Step 5: Check**

`tsc` clean. Browser pane: 375 px `/order` with items → round button bottom-right with badge and total, no bar; tap → sheet, no GST sentence; `/` shows the FAB too; `/checkout` does not. 1280 px `/order` → open panel on the right with steppers, no FAB; empty cart → panel still there with the empty text.

- [ ] **Step 6: Commit**

```bash
git add -A web/src/apps/storefront
git commit -m "feat(cart): floating cart button, open cart panel on wide /order

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Time slots — `timeSlots.ts`

**Files:**
- Create: `web/src/apps/shared/lib/timeSlots.ts`, `web/scripts/verify-time-slots.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const SLOT_MINUTES = 30;
  export const LEAD_MINUTES = 40;
  export function dayOptions(hours: MenuHours | undefined, now: Date, days = 7): { date: string; label: string; closed: boolean }[]
    // date "YYYY-MM-DD"; label "Today" | "Tomorrow" | "Sat 14"; closed when the weekday has no kitchen window (never closed when hours are unconfigured)
  export function slotsFor(hours: MenuHours | undefined, date: string, now: Date): string[]
    // "HH:mm" values inside that day's windows (08:00–22:00 when unconfigured); for today only slots ≥ now + LEAD_MINUTES, snapped up to the grid
  export function firstAvailable(hours: MenuHours | undefined, now: Date): { date: string; time: string } | null
  export function toLocalValue(date: string, time: string): string   // `${date}T${time}`
  ```

- [ ] **Step 1: Failing script**

`web/scripts/verify-time-slots.mjs`:

```js
/** Date/time chips are built from the opening hours the menu already carries. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/timeSlots.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { dayOptions, slotsFor, firstAvailable } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
// Sat 2026-09-12 (weekday 6). Kitchen: Mon–Sat 11:00–15:00 and 18:00–22:00; Sunday closed.
const win = (weekday, o, c) => ({ weekday, opens_at: o, closes_at: c });
const kitchen = [];
for (const d of [1, 2, 3, 4, 5, 6]) kitchen.push(win(d, '11:00:00', '15:00:00'), win(d, '18:00:00', '22:00:00'));
const hours = { kitchen, categories: {}, open_now: true, closed_category_ids: [], next_open_at: null, server_now: '' };
const at = (h, m = 0) => new Date(2026, 8, 12, h, m);

console.log('dayOptions');
const days = dayOptions(hours, at(10));
check('seven days', 7, days.length);
check('labels', ['Today', 'Tomorrow', 'Mon 14'], days.slice(0, 3).map((d) => d.label));
check('sunday is closed', true, days[1].closed);
check('dates', '2026-09-12', days[0].date);
check('unconfigured: nothing closed', false, dayOptions(undefined, at(10)).some((d) => d.closed));

console.log('\nslotsFor');
check('a future day lists both windows', ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'], slotsFor(hours, '2026-09-14', at(10)));
check('today at 10:00: lead of 40 min keeps 11:00', '11:00', slotsFor(hours, '2026-09-12', at(10))[0]);
check('today at 12:50: 13:30 is first (12:50+40 = 13:30)', '13:30', slotsFor(hours, '2026-09-12', at(12, 50))[0]);
check('today at 12:41: 13:30 (13:21 snaps up)', '13:30', slotsFor(hours, '2026-09-12', at(12, 41))[0]);
check('today at 14:50: afternoon gone, evening remains', '18:00', slotsFor(hours, '2026-09-12', at(14, 50))[0]);
check('today at 21:45: nothing left', [], slotsFor(hours, '2026-09-12', at(21, 45)));
check('closed day is empty', [], slotsFor(hours, '2026-09-13', at(10)));
check('unconfigured hours: 08:00–22:00', ['08:00', '22:00'], (() => { const s = slotsFor(undefined, '2026-09-14', at(10)); return [s[0], s[s.length - 1]]; })());

console.log('\nfirstAvailable');
check('today when it has a slot', { date: '2026-09-12', time: '11:00' }, firstAvailable(hours, at(10)));
check('skips a closed Sunday to Monday', { date: '2026-09-14', time: '11:00' }, firstAvailable(hours, at(21, 45)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run** → fails (module missing).

- [ ] **Step 3: Implement `timeSlots.ts`**

```ts
import type { HourWindow, MenuHours } from '../types';

export const SLOT_MINUTES = 30;
export const LEAD_MINUTES = 40;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = (t: string) => { const [h = 0, m = 0] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The kitchen's windows on a weekday; a default day when hours are unconfigured. */
function windowsOn(hours: MenuHours | undefined, weekday: number): HourWindow[] {
  if (!hours || hours.kitchen.length === 0) return [{ weekday, opens_at: '08:00:00', closes_at: '22:00:00' }];
  return hours.kitchen.filter((w) => w.weekday === weekday);
}

export function dayOptions(hours: MenuHours | undefined, now: Date, days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAYS[d.getDay()]} ${d.getDate()}`;
    out.push({ date: isoDate(d), label, closed: windowsOn(hours, d.getDay()).length === 0 });
  }
  return out;
}

export function slotsFor(hours: MenuHours | undefined, date: string, now: Date): string[] {
  const [y, mo, da] = date.split('-').map(Number);
  const day = new Date(y, mo - 1, da);
  const today = isoDate(now) === date;
  // Earliest slot today: now + lead, snapped UP to the grid.
  const floor = today ? Math.ceil((now.getHours() * 60 + now.getMinutes() + LEAD_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES : 0;
  const out: string[] = [];
  for (const w of windowsOn(hours, day.getDay())) {
    const o = mins(w.opens_at);
    const c = mins(w.closes_at) > o ? mins(w.closes_at) : 24 * 60 - SLOT_MINUTES; // overnight window: stop before midnight
    for (let m = Math.ceil(o / SLOT_MINUTES) * SLOT_MINUTES; m <= c; m += SLOT_MINUTES) {
      if (m >= floor && !out.includes(hhmm(m))) out.push(hhmm(m));
    }
  }
  return out.sort();
}

export function firstAvailable(hours: MenuHours | undefined, now: Date): { date: string; time: string } | null {
  for (const d of dayOptions(hours, now)) {
    const s = slotsFor(hours, d.date, now);
    if (s.length) return { date: d.date, time: s[0] };
  }
  return null;
}

export function toLocalValue(date: string, time: string): string {
  return `${date}T${time}`;
}
```

- [ ] **Step 4: Run** → `16 passed`.

- [ ] **Step 5: Commit**

```bash
git add web/src/apps/shared/lib/timeSlots.ts web/scripts/verify-time-slots.mjs
git commit -m "feat(checkout): time-slot maths from the opening hours

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `DatePicker` + `TimePicker` replace `DateTimePicker`

**Files:**
- Create: `web/src/apps/storefront/components/DatePicker.tsx`, `TimePicker.tsx`
- Delete: `DateTimePicker.tsx`
- Modify: `pages/Checkout.tsx` (state init + the "When" field) — the full layout comes in Task 12; here only swap the picker.

**Interfaces:**
- Consumes: `dayOptions`, `slotsFor`, `firstAvailable`, `toLocalValue`.
- Produces: `DatePicker({ hours, value, onChange })` and `TimePicker({ hours, date, value, onChange })` where `value` for the date is `"YYYY-MM-DD"` and for the time `"HH:mm"`.

- [ ] **Step 1: Components**

`DatePicker.tsx`:

```tsx
import type { MenuHours } from '../../shared/types';
import { dayOptions } from '../../shared/lib/timeSlots';

/** The next seven days as chips; a day the kitchen is shut is struck through. */
export function DatePicker({ hours, value, onChange }: { hours?: MenuHours; value: string; onChange: (date: string) => void }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dayOptions(hours, new Date()).map((d) => (
        <button key={d.date} type="button" disabled={d.closed} onClick={() => onChange(d.date)}
          aria-pressed={d.date === value}
          className={`chip shrink-0 ${d.date === value ? 'chip-active' : ''} ${d.closed ? 'line-through opacity-50' : ''}`}>
          {d.label}
        </button>
      ))}
    </div>
  );
}
```

`TimePicker.tsx`:

```tsx
import type { MenuHours } from '../../shared/types';
import { slotsFor } from '../../shared/lib/timeSlots';

/** 30-minute slots for the chosen day, from the kitchen's windows. */
export function TimePicker({ hours, date, value, onChange }: { hours?: MenuHours; date: string; value: string; onChange: (time: string) => void }) {
  const slots = slotsFor(hours, date, new Date());
  if (slots.length === 0) return <p className="text-sm text-brand-500">Nothing left today — pick another day.</p>;
  const show = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`; };
  return (
    <div className="flex flex-wrap gap-2">
      {slots.map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={t === value}
          className={`chip ${t === value ? 'chip-active' : ''}`}>{show(t)}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Checkout state**

Replace `whenLocal` handling: keep `whenLocal` as the submitted value but derive it:

```ts
const [date, setDate] = useState('');
const [time, setTime] = useState('');
// Preselect the first slot once hours arrive (unconfigured hours resolve immediately).
useEffect(() => {
  if (date) return;
  const f = firstAvailable(hours, new Date());
  if (f) { setDate(f.date); setTime(f.time); }
}, [hours, date]);
const whenLocal = date && time ? toLocalValue(date, time) : '';
const pickDate = (d: string) => {
  setDate(d); setWhenErr('');
  const s = slotsFor(hours, d, new Date());
  if (!s.includes(time)) setTime(s[0] ?? '');
};
```

Field markup: two `Field`s — "Which day?" → `<DatePicker hours={hours} value={date} onChange={pickDate} />`, "What time?" (error `whenErr`) → `<TimePicker hours={hours} date={date} value={time} onChange={(t) => { setTime(t); setWhenErr(''); }} />`. Remove `defaultNeededOnLocal` import if now unused (check `grep -rn defaultNeededOnLocal web/src` — NewOrder may still use it; leave the export).

Delete `DateTimePicker.tsx`; `tsc` must be clean.

- [ ] **Step 3: Check**

Browser pane `/checkout` with a cart: day chips (Today … +6), a closed weekday struck through if hours say so; time chips; picking a day the current time is not valid on moves the time; place a test order → `needed_at` in the DB equals the chosen slot. Delete the test order.

- [ ] **Step 4: Commit**

```bash
git add -A web/src/apps/storefront
git commit -m "feat(checkout): separate day and time chips built from opening hours

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Upsell — `upsell.ts` + `UpsellStrip`

**Files:**
- Create: `web/src/apps/shared/lib/upsell.ts`, `web/scripts/verify-upsell.mjs`, `web/src/apps/storefront/components/UpsellStrip.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function suggestUpsells(args: {
    items: MenuItem[]; categories: MenuCategory[]; cartItemIds: number[];
    closedCategoryIds: number[]; max?: number;             // default 4
  }): MenuItem[]
  ```
  and `UpsellStrip({ menu, closedCategoryIds }: { menu: MenuResponse | undefined; closedCategoryIds: number[] })` — check the actual name of the menu response type in `shared/api/endpoints.ts` (`menuApi.get()` return) and use it.

- [ ] **Step 1: Failing script**

`web/scripts/verify-upsell.mjs`:

```js
/** "Goes well with": rule order, skips, and the cap of four. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/upsell.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { suggestUpsells } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
const categories = [
  { id: 7, name: 'Starters', sort_order: 1 }, { id: 9, name: 'Fried Rice and Noodles', sort_order: 2 },
  { id: 12, name: 'Main Course', sort_order: 3 }, { id: 13, name: 'Tandoori Breads', sort_order: 4 },
  { id: 14, name: 'Tawa Breads', sort_order: 5 }, { id: 15, name: 'Rice and Biryani', sort_order: 6 },
  { id: 16, name: 'Salads', sort_order: 7 },
];
const it = (id, category_id, name, price, sort_order = 0) => ({ id, category_id, subcategory_id: null, name, price, unit: '', variants: [], addons: [], sort_order });
const items = [
  it(1, 12, 'Paneer Butter Masala', 249), it(2, 13, 'Butter Naan', 40, 1), it(3, 13, 'Tandoori Roti', 15, 0),
  it(4, 14, 'Paratha', 30), it(5, 15, 'Jeera Rice', 120), it(6, 16, 'Green Salad', 60), it(7, 7, 'Paneer Tikka', 249),
  it(8, 9, 'Veg Noodles', 180), it(9, 12, 'Dal Fry', 149),
];
const names = (r) => r.map((x) => x.name);
const run = (cart, closed = []) => names(suggestUpsells({ items, categories, cartItemIds: cart, closedCategoryIds: closed }));

check('main course → two breads (sort order), a rice, a salad', ['Tandoori Roti', 'Butter Naan', 'Jeera Rice', 'Green Salad'], run([1]));
check('main + bread already → rice, salad, then fill', ['Jeera Rice', 'Green Salad', 'Paneer Tikka', 'Veg Noodles'], run([1, 2]));
check('starter only → a main, salad, fill', ['Dal Fry', 'Green Salad', 'Tandoori Roti', 'Paratha'], run([7]));
check('chinese only → a main first', 'Dal Fry', run([8])[0]);
check('closed category skipped', ['Butter Naan', 'Paratha', 'Jeera Rice', 'Green Salad'].includes(run([1], [13])[0]) && !run([1], [13]).includes('Tandoori Roti'), true);
check('never suggests what is in the cart', false, run([1, 5]).includes('Jeera Rice'));
check('cap of four', 4, run([]).length);
check('max honoured', 2, suggestUpsells({ items, categories, cartItemIds: [1], closedCategoryIds: [], max: 2 }).length);
check('unknown category names degrade to fill', 4, suggestUpsells({ items, categories: categories.map((c) => ({ ...c, name: 'X' + c.id })), cartItemIds: [1], closedCategoryIds: [] }).length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

(The closed-category check is written as a boolean equality so the exact fill order is not over-specified.)

- [ ] **Step 2: Run** → fails.

- [ ] **Step 3: Implement `upsell.ts`**

```ts
import type { MenuCategory, MenuItem } from '../types';

/**
 * What to offer on checkout, from the menu already loaded. Rules run in order
 * until `max` dishes are found; anything in the cart, unavailable to add, or in
 * a closed section is skipped. Categories are found by NAME so a renumbered
 * menu falls through to the generic fill instead of breaking.
 */
export function suggestUpsells({ items, categories, cartItemIds, closedCategoryIds, max = 4 }: {
  items: MenuItem[]; categories: MenuCategory[]; cartItemIds: number[]; closedCategoryIds: number[]; max?: number;
}): MenuItem[] {
  const idOf = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? -1;
  const MAIN = idOf('Main Course'), BREADS = [idOf('Tandoori Breads'), idOf('Tawa Breads')], RICE = idOf('Rice and Biryani');
  const STARTERS = [idOf('Starters'), idOf('Tandoori Starters'), idOf('Fried Rice and Noodles')], SALAD = idOf('Salads');

  const inCart = new Set(cartItemIds);
  const cartCats = new Set(items.filter((i) => inCart.has(i.id)).map((i) => i.category_id));
  const has = (...cats: number[]) => cats.some((c) => c >= 0 && cartCats.has(c));
  const bySort = (a: MenuItem, b: MenuItem) => a.sort_order - b.sort_order || a.id - b.id;
  const byPrice = (a: MenuItem, b: MenuItem) => a.price - b.price || a.id - b.id;

  const out: MenuItem[] = [];
  const pool = items.filter((i) => !inCart.has(i.id) && !closedCategoryIds.includes(i.category_id));
  const take = (cats: number[], n: number, cmp = bySort) => {
    for (const it of pool.filter((i) => cats.includes(i.category_id)).sort(cmp)) {
      if (out.length >= max || n <= 0) return;
      if (!out.includes(it)) { out.push(it); n--; }
    }
  };

  if (has(MAIN) && !has(...BREADS)) take(BREADS, 2);
  if (has(MAIN) && !has(RICE)) take([RICE], 1);
  if (has(...STARTERS) && !has(MAIN)) take([MAIN], 1);
  if (!has(SALAD)) take([SALAD], 1);
  // Fill: cheapest dishes from sections not in the cart.
  const rest = pool.filter((i) => !cartCats.has(i.category_id)).sort(byPrice);
  for (const it of rest) { if (out.length >= max) break; if (!out.includes(it)) out.push(it); }
  return out.slice(0, max);
}
```

(`MenuItem` needs `sort_order` on the client type — check `shared/types` `MenuItem`; if absent, add `sort_order: number` and confirm `api/routes/menu.php` sends it. It selects `sort_order` for ordering; add it to the payload if missing.)

- [ ] **Step 4: Run** → all pass; adjust expectations only if the rule text in the spec disagrees with the script, never the other way.

- [ ] **Step 5: `UpsellStrip`**

```tsx
import { useMemo, useState } from 'react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { suggestUpsells } from '../../shared/lib/upsell';
import { DishImage } from '../../shared/components/ui/DishImage';
import type { MenuItem } from '../../shared/types';
import { ItemPickerModal } from './ItemPickerModal';

/** "Goes well with" — up to four one-tap additions chosen from the menu. */
export function UpsellStrip({ items, categories, closedCategoryIds }: {
  items: MenuItem[]; categories: { id: number; name: string; sort_order: number }[]; closedCategoryIds: number[];
}) {
  const { lines, add } = useCart();
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const cartItemIds = lines.map((l) => l.id);
  const picks = useMemo(() => suggestUpsells({ items, categories, cartItemIds, closedCategoryIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, categories, cartItemIds.join(','), closedCategoryIds.join(',')]);
  if (picks.length === 0) return null;
  const onAdd = (it: MenuItem) => {
    if (it.variants.length || it.addons.length) setPicking(it);
    else add({ id: it.id, name: it.name, unit: it.unit, basePrice: it.price, qty: 1 });
  };
  return (
    <section className="card-soft p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Goes well with</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {picks.map((it) => (
          <li key={it.id} className="flex flex-col rounded-2xl border border-cream-200 p-2">
            <DishImage item={it} className="aspect-[4/3] w-full" rounded="rounded-xl" />
            <p className="mt-2 line-clamp-1 text-sm font-medium text-brand-900">{it.name}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-brand-500">{it.variants.length ? 'from ' : ''}{rupees(it.price)}</span>
              <button type="button" onClick={() => onAdd(it)} className="rounded-full border border-brand-900 px-3 py-0.5 text-xs font-semibold text-brand-900 hover:bg-brand-900 hover:text-cream-50">+ Add</button>
            </div>
          </li>
        ))}
      </ul>
      {picking && <ItemPickerModal item={picking} open onClose={() => setPicking(null)} />}
    </section>
  );
}
```

(`DishImage` accepts `className`/`rounded` per `MenuItemRow`; if the aspect prop differs, match its API.)

- [ ] **Step 6: Commit**

```bash
git add web/src/apps/shared/lib/upsell.ts web/scripts/verify-upsell.mjs web/src/apps/storefront/components/UpsellStrip.tsx web/src/apps/shared/types/index.ts api/routes/menu.php
git commit -m "feat(checkout): Goes well with — rule-based upsell from the loaded menu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Checkout layout, editable cart, GST note gone

**Files:**
- Modify: `web/src/apps/storefront/pages/Checkout.tsx` (return block), `components/BillDetails.tsx:98-104`

- [ ] **Step 1: `BillDetails` note**

Replace the `<p className="mt-2 text-xs text-brand-400">…` block with:

```tsx
<p className="mt-2 text-xs text-brand-400">
  {comp ? 'This order is on us — nothing to pay.' : 'Final price is confirmed by us on the phone — delivery charges may apply.'}
</p>
```

Update the component docblock (no longer "cart editing happens in the CartSheet, not here" — say lines are edited on the checkout page's own card).

- [ ] **Step 2: Checkout layout**

Grid: `mt-6 grid gap-6 md:grid-cols-[1fr_24rem] md:items-start`. Left `<form className="min-w-0 space-y-6">` sections in this order, each `card-soft p-6`:

1. **Your order** — `<CartLines />` (full-size stepper) + `<Link to="/order" className="link-quiet text-sm">+ Add more dishes</Link>`.
2. **Delivery** — the address picker (unchanged).
3. **When** — the two fields from Task 10.
4. **Contact** — name / phone (unchanged fields).
5. **Anything else** — occasion + notes.

Right `<aside className="md:sticky md:top-20 space-y-4">`: `<UpsellStrip items={menu.data?.items ?? []} categories={menu.data?.categories ?? []} closedCategoryIds={closedIds} />` (compute `closedIds` from `hours` the same way `Order.tsx` does for its "back at" logic — reuse `nextOpenForCategory`/`closed_category_ids` from `hours`), then `BillDetails`, minimum-order warning, Place order, call link, push nudge, back link. On `< md` the natural DOM order is left column then aside; to put the upsell above the bill but after the cart on mobile, render `UpsellStrip` inside the left column after section 1 with `md:hidden`, and in the aside with `hidden md:block`.

- [ ] **Step 3: Check**

`tsc` clean. Browser pane 375 px: Your order card with steppers and bin; removing the last line returns to `/order`; upsell strip after it; day/time chips; bill without the GST sentence; Place order shows the grand total. 1280 px: two columns, sticky right, upsell above the bill, no horizontal scrollbar (`document.documentElement.scrollWidth === innerWidth` via javascript_tool). Place a real test order and confirm `order_items.variant_ids` and `orders.needed_at`; delete only that order.

- [ ] **Step 4: Commit**

```bash
git add web/src/apps/storefront
git commit -m "feat(checkout): edit the cart on the page, upsell column, no GST note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: README, builds, phone

**Files:**
- Modify: `README.md` (the menu options / CSV section, the Deploy checklist: migration 015 then `menu_options.sql` 015 section)

- [ ] **Step 1: README**

In the menu-options section document: variant groups (`group_label`, default Preparation, one default per group), the CSV cell format `Preparation=Half:-70|Full:*+150|Vegetables=With Vegetables:*0|Without Vegetables:0`, and that `order_items.variant_ids` supersedes `variant_id`. In the production steps add: run `migration_015_variant_groups.sql` (or `migrate_production.sql`), then the "015 — groups" section of `menu_options.sql`.

- [ ] **Step 2: Full verification**

```bash
C:/xampp/php/php.exe scripts/verify-cumulative-migration.php
C:/xampp/php/php.exe scripts/verify-install-file.php
C:/xampp/php/php.exe scripts/verify-order-lines.php
C:/xampp/php/php.exe scripts/verify-menu-snapshot.php
cd web && node scripts/verify-cart.mjs && node scripts/verify-time-slots.mjs && node scripts/verify-upsell.mjs && npx tsc --noEmit -p . && npm run build && cd ..
```

All green.

- [ ] **Step 3: Android build and install** (per memory `android-build-stack`): `VITE_API_ORIGIN=https://vaatsalyakitchens.in npm run build:app`, `npx cap sync android`, Gradle debug APK with JDK 21, `adb -s RF8N21BGN6M install -r`. On the phone: FAB, See more gallery swipe, picker groups, checkout chips.

- [ ] **Step 4: Commit and hand back**

```bash
git add README.md
git commit -m "docs: variant groups, CSV format and the 015 deploy step

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then use superpowers:finishing-a-development-branch (merge to `main`, push — deploy is the user's manual workflow_dispatch; production SQL order: migration 015 → `menu_options.sql` 015 section).

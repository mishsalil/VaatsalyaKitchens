# Ratings & Reviews Phase 1 — Verification Record

Date: 2026-09-10
Branch: `feat/ratings-reviews`
Environment: local dev (Windows, XAMPP — `C:\xampp\php\php.exe`, `C:\xampp\mysql\bin\mysql.exe`, database `vaatsalya_kitchens`)

This record transcribes the actual output of every verification script and
manual check run at the end of Task 11. Nothing here is written from memory or
from the task brief — each command was executed and its real output captured.

## PHP verification scripts

### `scripts/verify-review-schema.php`
Exit code: 0

```
built fresh from install_fresh.sql
  ok   fresh has table order_reviews
  ok   fresh has table order_item_reviews
  ok   fresh has table review_prompts
  ok   fresh has table review_tokens
  ok   fresh orders has delivered_at
  ok   fresh has reviews_since setting
built a pre-013 database
applied migrate_production.sql
  ok   migrated has table order_reviews
  ok   order_reviews identical on both paths
  ok   migrated has table order_item_reviews
  ok   order_item_reviews identical on both paths
  ok   migrated has table review_prompts
  ok   review_prompts identical on both paths
  ok   migrated has table review_tokens
  ok   review_tokens identical on both paths
  ok   migrated orders has delivered_at
applied migrate_production.sql a second time
  ok   order_reviews unchanged after re-run
  ok   order_item_reviews unchanged after re-run
  ok   review_prompts unchanged after re-run
  ok   review_tokens unchanged after re-run

19 passed, 0 failed
```

### `scripts/verify-review-due.php`
Exit code: 0

```
eligibility by status
  ok   delivered is eligible
  ok   confirmed is eligible
  ok   preparing is eligible
  ok   out_for_delivery is eligible
  ok   new is NOT eligible
  ok   cancelled is NOT eligible
  ok   unknown is NOT eligible

delivered_at drives the 30-minute rule
  ok   delivered_at + 30
  ok   delivered_at wins over needed_at

no delivered_at falls back 60 minutes
  ok   needed_at + 60
  ok   counter order: created_at + 60
  ok   fallback applies to a non-delivered status

ineligible orders have no due time at all
  ok   new order
  ok   cancelled order
  ok   cancelled even when delivered_at is set

midnight and month boundaries
  ok   crosses midnight
  ok   crosses month end
  ok   crosses year end on the fallback

18 passed, 0 failed
```

### `scripts/verify-review-tokens.php`
Exit code: 0

```
issue and resolve
  ok   token has selector.validator shape
  ok   resolves to the order
  ok   resolving twice still works (not burned)

many tokens per order, all valid
  ok   second token differs
  ok   first token still resolves
  ok   second token resolves

rejections
  ok   null
  ok   empty
  ok   no dot
  ok   unknown selector
  ok   tampered validator
  ok   right selector, other order validator

expiry
  ok   expired token rejected
  ok   unexpired sibling still fine

burn takes them all
  ok   first burned
  ok   second burned
  ok   other order untouched

validator is never stored in plaintext
  ok   stored value is not the validator
  ok   stored value is its sha256

19 passed, 0 failed
```

### `scripts/verify-review-validation.php`
Exit code: 0

```
stars must be an integer 1..5
  ok   refuses stars = 0
  ok   refuses stars = 6
  ok   refuses stars = -1
  ok   refuses stars = 99
  ok   accepts stars = 1

one review per order
  ok   refuses a second review
  ok   still exactly one row

comment length
  ok   accepts 1000 characters
  ok   refuses 1001 characters

per-dish rows must belong to the order
  ok   refuses a line from another order
  ok   nothing was written on refusal
  ok   accepts this order's own lines
  ok   wrote both dish rows
  ok   denormalised menu_item_id

per-dish stars are validated too
  ok   refuses a dish rated 0
  ok   nothing written

cancelled orders cannot be rated
  ok   refuses a cancelled order

submitting burns the order's tokens
  ok   token valid before
  ok   token dead after

comment is stored verbatim, never escaped at rest
  ok   stored byte-for-byte

20 passed, 0 failed
```

### `scripts/verify-review-sweep.php`
Exit code: 0

```
picked up
  ok   delivered and past due
  ok   never marked delivered, past the fallback
  ok   counter order with no needed_at

left alone
  ok   not yet due
  ok   status new
  ok   cancelled
  ok   created before reviews_since

already rated
  ok   rated order dropped

prompt state
  ok   sent order dropped
  ok   sent_at recorded
  ok   failed once, still a candidate
  ok   after three failures it goes quiet
  ok   the error is kept for diagnosis

due_at is refreshed, not frozen
  ok   still a candidate after delivery was marked
  ok   recomputed due_at uses delivered_at + 30

database clock, not PHP's
  ok   delivered 40 minutes ago (db clock) is already due
  ok   sent_at and created_at come from the same clock

17 passed, 0 failed
```

### `scripts/verify-review-cutover.php`
Exit code: 0 — **not listed in the task brief; added during implementation.**

```
  ok   fixture order is genuinely due (proves Check B is non-vacuous)
  ok   guard returns no candidates when reviews_since is missing

2 passed, 0 failed
```

### `scripts/verify-review-clocks.php`
Exit code: 0 — **not listed in the task brief; added during implementation.**

```
PASS: no PHP-clock usage found in 6 scanned files.
```

### `scripts/verify-cumulative-migration.php`
Exit code: 0

```
Numbered chain: 14 files
  built vk_drift_numbered (schema + every migration through migration_013_reviews.sql)
  built vk_drift_cumulative (schema + cumulative x2)

Compared 245 objects (columns + indexes)
IDENTICAL - no drift
scratch databases dropped
```

### `scripts/verify-install-file.php`
Exit code: 0

```
built from schema.sql + 13 numbered migrations
built from install_fresh.sql alone

compared 245 objects (columns + indexes)
IDENTICAL
  seeded admin_users        1
  seeded menu_categories    4
  seeded menu_items         19
  seeded kitchen_hours      7
  seeded settings           7

guard: running it again on the now-populated database...
  PASS — refused: SQLSTATE[42S02]: Base table or view not found: 1146 Table 'vk_inst_single.refusing_to_run__database_is_not_empty' doesn'

scratch databases dropped
```

## Web (Node/TypeScript) verification

Run from `web/`.

### `node scripts/verify-rate-lines.mjs`
Exit code: 0

```
the simple case
  ok   one line, one group

same dish across variants collapses
  ok   two variants of one dish

different dishes stay apart, in first-seen order
  ok   two dishes

pre-migration_007 lines group by name, never by null
  ok   two different unattributed dishes stay apart
  ok   same unattributed dish merges
  ok   an id-bearing line never merges with a null one

edges
  ok   empty order
  ok   quantities sum, not count

8 passed, 0 failed
```

### `npx tsc --noEmit`
Exit code: 0. No output (clean).

### `npm run build`
Exit code: 0

```
> vaatsalya-kitchens-web@0.1.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1640 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     3.79 kB │ gzip:  1.47 kB
dist/assets/index-CBXPt-BK.css     44.43 kB │ gzip:  7.93 kB
dist/assets/web-kOIUrTBC.js         0.84 kB │ gzip:  0.40 kB
dist/assets/AdminArea-mXdj60MD.js 165.27 kB │ gzip: 41.43 kB
dist/assets/index-DcX663YW.js     327.97 kB │ gzip: 98.44 kB
✓ built in 3.43s
```

## Manual checks

### Leftover throwaway databases

```
C:\xampp\mysql\bin\mysql.exe -u root -e "SHOW DATABASES LIKE 'vk_%';"
```

Output: empty (no rows). No throwaway `vk_*` scratch databases were left
behind by any of the verification scripts above.

## Summary

Every script listed by the controller (the brief's original 9 commands plus
the 2 added during implementation — `verify-review-cutover.php` and
`verify-review-clocks.php`) was run in this pass. All 9 PHP scripts, the
Node script, `tsc --noEmit`, and `npm run build` exited 0. Nothing failed and
nothing was silently adjusted to pass.

## NOT exercised

The following were **not** run or observed as part of this verification pass,
and this record makes no claim about their behavior:

- **The cron job firing on the live Hostinger host.** `send-review-prompts.php`
  was exercised only indirectly, through `verify-review-sweep.php`'s
  database-level candidate selection logic. No cron job has been created on
  Hostinger, and no run of the script against production has happened.
- **A real push notification arriving on a real device.** No physical or
  emulated device received a push during this task.
- **The rating page submitting from inside the packaged Android APK.** No APK
  build was produced or tested in this task; `/rate/:token` was verified only
  through the scripts above (token issuance/resolution, validation rules),
  not through the WebView.

These three remain open operator steps, as called out in the task brief's
"Operator steps this plan cannot perform" section.

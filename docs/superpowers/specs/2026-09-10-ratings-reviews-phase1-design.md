# Ratings and reviews, phase 1: capture and the internal loop

**Date:** 2026-09-10
**Status:** approved, not yet implemented

## The problem

There is no way for a customer to tell us the food was bad, and no way for us to
find out that it was. An unhappy customer simply stops ordering, and the first
signal we get is an absence we never notice.

The request was "an intelligent rating and review system equivalent to Zomato".
Most of Zomato's system exists to rank restaurants against each other and to run
a public review feed, with the moderation, defamation and reply-management burden
that implies. **Neither applies here.** There is one kitchen, and the decision was
made during design that review text stays internal — the public storefront will
show an aggregated number and nothing else.

What transfers is the useful half: capture the rating reliably, get an unhappy
customer in front of a human fast, and accumulate enough per-dish signal to make
menu decisions later.

## Scope: this is phase 1 of three

Agreed during brainstorming:

1. **Capture and the internal loop** — this document. Schema, the prompt
   scheduler, the rating page, an admin screen, the low-rating alert.
2. **Aggregation and public badges** — Bayesian-weighted, time-decayed scores,
   star badges on dishes, `AggregateRating` structured data.
3. **Themes and at-risk customers** — the keyword tagger and churn rules.

Phases 2 and 3 get their own specs. Building the keyword tagger now would mean
tuning a word list against zero reviews, and building the aggregate maths now
would mean choosing a prior with no data to choose it from.

**No LLM.** Explicitly decided. Phase 3's tagging will be a curated keyword list.
The schema below leaves comment text intact and untransformed so an LLM pass can
be added later without a backfill, but nothing here depends on one.

## What is already built, and depended on

- `includes/push.php` — `push_send_to_customer()` and `push_send_to_admins()`.
  The prompt and the alert are both existing calls, not new infrastructure.
- `includes/tokens.php` and the claim-token pair in `includes/auth.php` — the
  selector/validator shape this design copies exactly.
- `order_items.menu_item_id` (migration_007) — per-dish ratings can join back to
  the menu. **Order lines created before that migration ran have `NULL` here and
  can never be attributed to a dish.** Phase 1 stores what it can and does not
  pretend otherwise.
- `includes/settings.php` — the settings table, used here for the cutover date.

## What does NOT exist, and is the main new thing

**This project has no scheduler.** No cron script, no queue, no background
worker. The agreed timing rule needs one:

> 30 minutes after `delivered` is marked. If delivery was never marked,
> 60 minutes after the scheduled delivery time.

That second clause cannot be served from the status-change handler, because the
whole point is that no status change happened. It requires something that wakes
up on its own.

**Decision: a real cron job on Hostinger** (hPanel → Cron Jobs), every 5 minutes,
running `scripts/send-review-prompts.php`. The alternative considered and
rejected was a sweep piggybacked on incoming admin requests: it needs no setup,
but it only fires while somebody is using the app, which silently turns
"30 minutes" into "whenever someone next opens the admin". A rule that only holds
during business hours is not the rule that was asked for.

This is a manual setup step in hPanel and cannot be done from this repo.

## Timing, precisely

`orders` has no `delivered_at`. The migration adds one, set whenever status
transitions to `delivered`.

```
due_at = delivered_at + 30 min                      when delivered_at is set
       = COALESCE(needed_at, created_at) + 60 min   otherwise
```

**The `created_at` fallback is not a guess about missing data — it is the counter
case.** `api/routes/admin/orders.php:408` does not insert `needed_at`, so every
walk-in order has `NULL` there, permanently. Counter orders are served
immediately, so `created_at` is the honest reference point for them.

Eligibility:

| Status | Prompted? | Why |
|---|---|---|
| `delivered` | yes | the normal path |
| `confirmed`, `preparing`, `out_for_delivery` | yes, on the 60-minute fallback | food almost certainly went out; nobody updated the screen |
| `new` | **no** | never confirmed — likely nothing was ever cooked |
| `cancelled` | **no** | there is nothing to rate |

**Historical orders are never prompted.** The migration writes a `reviews_since`
setting holding its own run time, and the sweep only considers orders created at
or after it. Without this, switching the cron on would message every customer in
the database about a meal from months ago.

## Schema (migration_013_reviews.sql)

Follows the existing convention: a numbered file, plus the same statements
appended to `database/migrate_production.sql` in the idempotent
`information_schema` guard style, plus `database/install_fresh.sql`. All three
must be kept in step — `scripts/verify-cumulative-migration.php` checks this.

```sql
ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL;

CREATE TABLE order_reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,          -- kept if the customer is later deleted
  stars       TINYINT UNSIGNED NOT NULL,  -- 1..5, the overall order rating
  comment     TEXT NULL,
  source      ENUM('link','account') NOT NULL DEFAULT 'link',  -- see note below
  acked_at    DATETIME NULL,              -- someone followed up on a bad review
  acked_by    INT UNSIGNED NULL,
  acked_label VARCHAR(120) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_order (order_id),
  CONSTRAINT fk_review_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE order_item_reviews (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id     INT UNSIGNED NOT NULL,
  order_item_id INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NULL,        -- denormalised at write time
  stars         TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_item_review (review_id, order_item_id),
  KEY idx_item_review_menu (menu_item_id),
  CONSTRAINT fk_item_review_review FOREIGN KEY (review_id)
    REFERENCES order_reviews(id) ON DELETE CASCADE
);

CREATE TABLE review_prompts (
  order_id    INT UNSIGNED PRIMARY KEY,
  due_at      DATETIME NOT NULL,
  sent_at     DATETIME NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prompt_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE review_tokens (
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
);
```

**Tokens are a separate table, many per order, and that is load-bearing.** The
plaintext validator exists for exactly one instant — at creation — and is never
stored. If a single token lived on the prompt row, "copy the rating link" for an
order that already had a prompt would have to rotate it, silently killing the
link already delivered by push. Instead every issuance appends a row, any
unexpired token for the order opens the rating page, and submitting the review
deletes all of them at once.

`source` records which door was used, and needs a precise rule because **both
doors carry a token**: it is `account` when the submitting request also carries a
valid customer bearer token belonging to the order's customer, and `link`
otherwise. That distinction is what tells us later whether the push prompt or the
in-app card is actually earning its keep. It is never used for authorisation —
the token alone decides that.

`due_at` in `review_prompts` is **a cache, not the source of truth.** A row can
be created by the manual rating-link endpoint before the order is delivered, at
which point the computed value is the 60-minute fallback; when the order is later
marked delivered the correct value becomes `delivered_at + 30 min`. The sweep
therefore recomputes `due_at` from the order on every pass and updates the row.
The stored column exists so the admin screen can show when a prompt is expected
without re-deriving it.

`menu_item_id` is denormalised onto `order_item_reviews` deliberately. It is the
column phase 2 aggregates over, and copying it at write time means the aggregate
does not depend on `order_items` rows surviving a future edit.

**`order_item_reviews` has no foreign key to `order_items` or `menu_items`.**
Menu items get deleted; a rating of a dish that no longer exists is still a fact
about a meal we served. The write path validates that `order_item_id` belongs to
the order being reviewed, which is the constraint that actually matters.

Deliberately **not** included: a visibility or exclusion flag on `order_reviews`.
Nothing reads these rows for a public number until phase 2, so there is nothing
to exclude a junk review from yet. Phase 2 adds it alongside the aggregates it
protects. Deleting the row works in the meantime.

## The token

A new file, `includes/review_tokens.php`, copying the claim-token pattern in
`includes/auth.php:56` — selector as the indexed lookup, only a sha256 of the
validator stored, `hash_equals` on compare.

Three differences from a claim token, each deliberate:

- **It is not burned on open.** A customer opens the link, gets distracted, comes
  back. Burning on first view loses the review. It is burned on successful
  submit, and the `UNIQUE` on `order_reviews.order_id` is the real guard against
  a second review.
- **It grants nothing but the right to rate one order.** It is not a session. It
  must never be accepted by `auth_token_resolve()`, which is why it lives in its
  own table rather than in `auth_tokens`.
- **14 days.** Long enough to survive a slow reply, short enough that a link
  forwarded around a WhatsApp group months later is dead.

Rate limited through the existing `too_many_attempts()` / `record_attempt()`
helpers, keyed on the selector, matching how `api/routes/auth.php:57` guards
claim redemption.

## API

**Public, token-authenticated** — `api/routes/reviews.php`:

- `GET /api/reviews/{token}` → the order as the rating page needs it: order id,
  date, the dish lines (deduplicated by `menu_item_id`, quantities summed), and
  whether a review already exists. Returns the customer's first name for the
  greeting and **nothing else about them** — no phone, no address. A rating link
  is a weaker credential than a session and must not leak more than the job needs.
- `POST /api/reviews/{token}` → `{ stars, comment?, items?: [{order_item_id, stars}] }`.

**The grouping contract:** `GET` returns dish *groups* (deduplicated as described
under Storefront), each carrying the list of `order_item_id`s it covers. The
client expands the group's chosen star back out to one entry per
`order_item_id`, so the rows written match `order_items` one-for-one and the
`UNIQUE (review_id, order_item_id)` constraint holds. The customer taps one dish
once; the database keeps full fidelity.

Validation, all server-side and all failing closed: `stars` an integer 1–5;
`comment` trimmed, capped at 1000 characters, stored verbatim; every
`order_item_id` must belong to this order; a duplicate submit returns 409, not a
second row.

**Authenticated customer** — added to `api/routes/account.php`:

- `GET /api/account/pending-review` → the most recent eligible unrated order, or
  null, including its rating token so the in-app card links into the same flow.

One flow, two doors. The card and the pushed link land on the same page.

**Admin** — `api/routes/admin/reviews.php`, behind a new `reviews` capability
granted to super, admin, manager and staff. **Not riders** — a rider sees the
order board to mark deliveries and has no business reading customer complaints.
The cap is added to both `includes/admin_roles.php` and its client mirror
`web/src/apps/admin/rbac.ts`; the server is the enforcement point and the mirror
only drives which nav item renders.

- `GET /api/admin/reviews` → paginated, newest first, filterable by minimum and
  maximum stars and by acknowledged state. Includes the per-dish rows and the
  order reference.
- `POST /api/admin/reviews/ack/{id}` → records `acked_at/by/label`, mirroring the
  cancel-acknowledgement pattern already in `orders`.
- `POST /api/admin/orders/rating_link/{id}` → returns the shareable URL for manual
  WhatsApp sending, issuing a fresh token row for the order each time. Built
  with `publicUrl()`, **not** `window.location.origin` — the counter runs the
  packaged APK, where the origin is `https://localhost`. This is the exact bug
  fixed in `979215c` for claim links and it would recur here verbatim.

## The sweep

`scripts/send-review-prompts.php`, run by cron every 5 minutes.

```
acquire MySQL GET_LOCK('vk_review_prompts', 0) or exit quietly
select up to 50 orders that:
  - were created at or after the `reviews_since` setting
  - have status in (confirmed, preparing, out_for_delivery, delivered)
  - have no row in order_reviews
  - have no prompt row, or one with sent_at IS NULL and attempts < 3
  - whose computed due_at has passed
for each:
  create the prompt row if absent (token, due_at, expires_at)
  push_send_to_customer(...) with the /rate/<token> URL
  on success: sent_at = NOW()
  on failure: attempts += 1, last_error = <reason>
release the lock
```

The lock is what stops two overlapping cron runs from double-prompting; a
5-minute schedule and a slow push round-trip make that a real possibility, not a
theoretical one. `attempts < 3` is what stops a customer with no push
subscription from being retried forever — after three tries the row goes quiet,
and that customer is reached by the in-app card or a manual WhatsApp link instead.

Failing to send is never fatal. The script logs and moves to the next order.

**A manually shared link does not suppress the automatic push.** The counter can
copy a rating link at any time, which creates the prompt row early; the sweep
will still push when the order comes due. This is deliberate — the endpoint
cannot know whether the copied link was actually sent to anyone, and treating a
copy as a send would silently lose the prompt for every order where staff copied
the link and then did not use it. The cost of being wrong the other way is one
extra notification about the same link, which is recoverable. If that proves
annoying in practice, the fix is a "already sent manually" toggle on the copy
action, not a guess in the sweep.

## Storefront

- **`/rate/:token`** — new page, `web/src/apps/storefront/pages/Rate.tsx`. Five
  taps for the overall rating. Once a rating is given, the dish list and the
  comment box appear beneath it — never before, so the fast path stays one tap.
  Submit is enabled by the overall star alone; dishes and comment are optional.
- **The pending-review card** — shown at the top of `Home` and `MyAccount` when
  `GET /api/account/pending-review` returns something. This is how a customer who
  never granted push permission gets asked at all, which on a storefront is most
  of them.
- A thank-you state after submit. No public display of anything.

Dish lines are deduplicated by `menu_item_id` before rendering. A party order can
list the same dish three times across variants; asking someone to rate paneer
three times is how you get no ratings at all. Lines with `NULL menu_item_id` (see
the migration_007 note above) are grouped by `item_name` instead.

## Admin

- **`/admin/reviews`** — new page. Newest first, star filter, an "unacknowledged
  low ratings" filter that defaults on, the comment, the per-dish stars, and a
  link through to the order. Acknowledging records who did it.
- **Comments are rendered as text.** React escapes by default; the requirement is
  simply that `dangerouslySetInnerHTML` never appears on this page. Customer-typed
  text displayed to staff is the classic stored-XSS route.
- **Dashboard tile** — count of unacknowledged ratings of 2 or below.

## Alerting

On submit, `stars <= 2` sends `push_send_to_admins()` pointing at
`/admin/reviews`.

**Not the urgent channel.** `vk_urgent` and `OrderAlarmService` ring at full
volume through silent mode, and that is correct for a new order nobody has seen.
A bad review needs a phone call today, not a siren at 11pm. It goes out on
`vk_default`.

## Verification

This repo has no test framework by design; verification is standalone scripts.

- **`scripts/verify-review-due.php`** — `review_due_at()` against every row of the
  eligibility table above, plus the boundaries: `delivered_at` set, `needed_at`
  set with no `delivered_at`, both null (the counter case), exactly at the
  threshold versus one minute either side, cancelled, new.
- **`scripts/verify-review-tokens.php`** — issue, resolve, resolve again (still
  valid, not burned), burn on submit, expired, tampered validator, unknown
  selector.
- **`scripts/verify-review-validation.php`** — stars 0/1/5/6/non-integer, comment
  at 999/1000/1001 characters, an `order_item_id` from a different order, a
  duplicate submit.
- **`web/scripts/verify-rate-lines.mjs`** — the dish deduplication, including
  lines with `NULL menu_item_id`.

The migration is checked by the existing `scripts/verify-cumulative-migration.php`
and `scripts/verify-install-file.php`.

Manual, and it must actually be done on the device rather than reasoned about:
the cron job firing on Hostinger, a real push arriving, and the rating page
submitting from the packaged APK.

## Explicitly out of scope

Public review display. Aggregate scores and star badges. `AggregateRating`
markup. Photos attached to reviews. Editing a submitted review. Replying to a
customer in-app. Sentiment analysis. Theme tagging. At-risk churn flagging.
WhatsApp Business API automation. Any LLM call.

## Open items for the operator

- The cron job must be created in Hostinger hPanel; nothing in this repo can do
  it. Command and schedule will be in the implementation plan.
- Whether the pending-review card should also appear for counter customers who
  have never claimed their account. They have no login, so the card cannot reach
  them — a manual WhatsApp rating link is the only route, and that is a habit
  question for the counter staff rather than a code question.

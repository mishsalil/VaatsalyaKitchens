# Vaatsalya Kitchens — Webapp

A full ordering webapp for **वात्सल्य Kitchens**, built for shared hosting
(PHP 8 + MySQL, standard cPanel). Designed so anyone from 12 to 70+ years old
can order easily.

## What it does

**For customers**
- Browse the menu and order with big **+ / −** buttons — no account needed, ever.
- Every order is **saved in the database** and the customer is
  **auto-registered** from name + phone. The device remembers them
  (180-day sign-in token held on the device): next visit their details are
  prefilled and their saved addresses appear as one-tap choices.
- Optional **4-digit PIN** lets them sign in from any other device
  (phone number + PIN) to see order history and reorder.
- **📍 Use my current location** — browser geolocation + OpenStreetMap fills
  the address; the map position is saved with the order.
- **Multiple saved addresses** (Home, Office, …) with a default.
- After ordering, one tap sends the order to your **WhatsApp** too (the
  original flow, kept as confirmation channel).
- **Push notifications**: "order confirmed", "out for delivery", etc. —
  right on their phone/desktop, no app install (PWA; on iPhone the site must
  be added to Home Screen, iOS 16.4+).

**For you (Admin panel at `/admin`)**
- Live dashboard (auto-refreshes): new orders, today's totals.
- Order detail: items, customer, WhatsApp-them link, Google-Maps link to the
  delivery location, and one-tap status buttons — each status change sends the
  customer a push notification.
- **Menu editor**: add/edit/hide items and categories, change prices — live
  immediately, no code editing.
- **Customers**: search, order history, addresses, reset a forgotten PIN.
- **Broadcast**: send a promo notification to all subscribed devices.
- **Settings**: change your admin password.

## Deploying to shared hosting (cPanel) — ~20 minutes

1. **Create the database** — cPanel → *MySQL® Databases*:
   create a database, create a user with a strong password, add the user to
   the database with **All Privileges**. Note down all three names.
2. **Import the schema** — cPanel → *phpMyAdmin* → select the database →
   *Import* → choose `schema.sql` → Go. This creates all tables, your starting
   menu, and the admin login.
3. **Upload the files** — cPanel → *File Manager* → `public_html` → upload
   everything in this repository (zip it first, upload, then "Extract").
   Keep the folder structure (`includes/`, `admin/`, `vendor/`, …).
4. **Configure** — in File Manager, copy `includes/config.sample.php` to
   `includes/config.php` and edit it: database credentials from step 1, your
   real WhatsApp number, and your site URL in `base_url`.
5. **Enable HTTPS** — cPanel → *SSL/TLS Status* → Run AutoSSL (free
   Let's Encrypt). Required for location and notifications to work.
6. **Set up push keys** — cPanel → *Terminal* (or ask your host):
   `php scripts/generate-vapid.php` inside `public_html`, then paste the two
   keys into `includes/config.php`. (Skip this step and everything still works
   — just without push notifications.)
7. **Change the admin password** — open `https://your-site/admin/`, sign in
   with username `admin`, password `ChangeMe@123`, then go to **Settings →
   Change admin password** immediately.
8. Make sure PHP version is **8.0+** — cPanel → *Select PHP Version*.

That's it. Orders will appear in `/admin` and customers register themselves
just by ordering.

**Updating an existing production database** (before ticking `migrations_done`
in the deploy workflow): run `database/migration_015_variant_groups.sql` (or
the cumulative `database/migrate_production.sql`, which includes it), then
re-run the "015 — groups" section at the bottom of `database/menu_options.sql`
so the Preparation/Vegetables groups and their defaults are seeded. If you
refresh the menu from `menu_snapshot.sql`, run it only *after* migration 015.

An app build older than this release cannot order the Deluxe Chinese Combo
(it posts a single variant id, and the server now needs one per group) —
every other dish still works, so ship the new APK alongside this deploy.

Discount codes: run `database/migration_016_discount_codes.sql` (or the
cumulative `database/migrate_production.sql`), then open **Admin →
Discounts** and set the budget — it starts at 0, which keeps the feature off
until you do.

Discount personas (five codes instead of three): run
`database/migration_017_discount_personas.sql` (or the cumulative
`database/migrate_production.sql`), then Regenerate on **Admin →
Discounts** to replace the old three codes with the new five.

## Menu data from Zomato

`database/menu_descriptions.sql`, `menu_additions.sql` and `menu_options.sql` were
generated from the partner-portal export (`Menu-data.xlsx`) and are plain, re-runnable
SQL matched by dish name. Prices follow **policy B**: the site keeps its own base
prices and Zomato's upcharges are applied relative to its cheapest option, so
"Normal" is +0 and the default. The export carries no dish-to-add-on mapping, so the
add-on groups are the kitchen's guess — South Indian sides on dosas, uttapams and
medu vada; Extra Cheese on sandwiches and wraps; Without Vegetables on noodles, fried
rice and the Chinese combos. Change them in Admin → Menu like any other option.

## Menu options (variants and add-ons)

Variants can be grouped into radio choices — e.g. Preparation (Half / Full) and,
independently, Vegetables (With / Without) on the same dish. A group is set by
`menu_item_variants.group_label`; variants with no group are still a flat radio
list, defaulting to "Preparation". Each group needs exactly one default
(`is_default = 1`) — the picker and counter both pick the first row otherwise,
which is why `menu_options.sql` always deletes and re-inserts a group's rows
together rather than patching one at a time.

In the menu CSV, the `variants` cell packs one or more groups into a single
pipe-joined string: `name:delta`, with a leading `*` marking that variant as
the group's default, and a `Group=` prefix starting a new group (the first
group with no prefix defaults to Preparation). For example:

```
Preparation=Half:-70|Full:*+150|Vegetables=With Vegetables:*0|Without Vegetables:0
```

Group labels are at most 40 characters, and this mini-format has no escape for
`=` or `:` inside a variant or group name — avoid those characters in either.

An order line can select more than one variant (one per group) —
`order_items.variant_ids` holds the chosen ids joined by commas (like
`addon_ids`), in group order. `variant_id` is NULL on every order written
after migration 015 and is only read for older rows; a posted `variant_id`
from an old app build (which has no concept of groups) is still accepted as
a one-element list.

## Discount codes

One number from the admin — **Admin → Discounts** (roles `super`/`admin`) —
sets a *share-of-sales* target: roughly how much of total sales the kitchen
is willing to give away across all discounted orders. `discount_plan()` in
`includes/discounts.php` turns budget B (a percent, clamped 0–50) and the
average pre-tax order A (30-day delivered average, or ₹400 with no history
yet) into an everyday rupee cap `C = round(B / 100 × A / 10) × 10`, then
sizes five codes around it:

| code | who may use it | % | cap | min order |
|---|---|---|---|---|
| `WELCOME` | first order (no earlier non-cancelled order on the phone) | 50 | 1.5C | — |
| `COMEBACK` | returning customer, no order in the last 45 days | 30 | 1.5C | — |
| `VK10` | anyone | 10 | C | — |
| `VK20` | anyone | 20 | 1.5C | ≈A |
| `FEAST` | anyone | 30 | 3C | ≈2A |

Code text is fixed (no more `VK<budget>`); marketing can still rename a code
on the Discounts page. Saving the budget (or clicking Regenerate) reruns
`discount_plan()` and writes it over the five codes, matched by kind — the
most recent row of a kind keeps its name and id — so a code no longer in the
plan is switched off, not deleted, and usage history survives. Setting the
budget to 0 turns the feature off.

Admin → Discounts also shows *"This month: ₹given on ₹sales of sales — Z% of
the B% target"* with a bar (green at or under target, amber over), plus
per-code uses and ₹given. An **Auto-pause** toggle, off by default: turn it
on and once this month's give-away passes the target, every code except
`WELCOME` pauses — dropped from the storefront's code list, refused at
checkout, shown greyed on the admin page — until next month or a lower
budget brings the share back down.

No code's percentage counts against the counter's **24%** ceiling on its
own — a code alone is always allowed, however deep its discount. The
ceiling only limits what a counter rep can stack on top of it: a manual
discount may be added only while code % + manual % stays at or under 24%.

## Review prompts (cron)

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

PHP and MySQL disagree about the current time on the development machine (PHP
defaults to the `Europe/Berlin` timezone, MySQL uses system time), and this
project sets no default timezone anywhere. For that reason the review feature
takes every "now" from the database rather than from PHP, and
`scripts/verify-review-clocks.php` scans a fixed list of the feature's files
and fails the build if any of them reaches for PHP's clock again, or if one
of those files goes missing. It does not cover files outside that list — a
new file added by a later phase must be added to the script's `$files` list
too — worth knowing if this gets deployed to a host with its own timezone
quirks.

## Address picker (Google Maps)

Customers place a pin on a map; the rider navigates to the pin. The pin's
coordinates are the truth and the typed text is a label. The counter pastes a
Google Maps link a customer sent on WhatsApp instead (no key needed for that,
nor for the rider's Navigate button).

The map needs a **Google Maps JavaScript API key**, entered once in
**Admin → Settings**. It is stored as a setting, not baked into the build, so
rotating it needs no new APK. **Blank means the plain address box** — nothing
breaks before the key exists.

Setting it up in Google Cloud:

1. Create a project and attach billing (each API below has a free monthly
   tier of 10,000 calls; at this volume the bill should be ₹0).
2. Enable **Maps JavaScript API**, **Places API (New)** and **Geocoding API**.
3. Create an API key restricted to those three APIs and to the HTTP referrers
   `vaatsalyakitchens.in/*` **and `localhost/*`** — the Android app serves
   the storefront from `https://localhost`, so without the second one the map
   is blank in the app.
4. Set a daily quota on the key. It is public by design (it runs in the
   browser), so the referrer restriction plus the quota is what protects it.

Checkout defaults to ASAP ("Ready in about 40 min"); toggling *Schedule for
later* reveals a month calendar (bookings up to 12 months ahead, closed days
greyed out) and Morning/Afternoon/Evening time chips. A form that gets
refused — client-side or a server 422 — scrolls to and focuses the first
field with a problem instead of just showing an error somewhere on the page.
Desktop pages (Menu, Checkout, Home, My Account) use the full 80 rem
(`max-w-7xl`) container, not the narrower one from before.

## Running locally (for development)

```bash
mysql -e "CREATE DATABASE vaatsalya_kitchens"
mysql vaatsalya_kitchens < schema.sql
cp includes/config.sample.php includes/config.php   # edit DB credentials
php -S localhost:8080
```

## Project layout

| Path | Purpose |
|---|---|
| `index.php`, `order.php` | Customer pages (menu comes from the database) |
| `order-success.php` | Confirmation + WhatsApp send + push opt-in + set PIN |
| `login.php`, `my-account.php` | Phone+PIN sign-in, order history, address book |
| `api/*.php` | JSON endpoints (place order, login, addresses, PIN, push) |
| `admin/*.php` | Admin panel |
| `includes/` | Config, DB, auth, push, CSRF, shared layout |
| `js/`, `css/`, `assets/` | Frontend |
| `service-worker.js`, `manifest.webmanifest` | PWA + notifications |
| `schema.sql` | Database schema + starting menu (import once) |
| `vendor/` | Web-push library (committed, so no Composer needed on the host) |

## Security notes

- All database access uses prepared statements; PINs and passwords are hashed
  (`password_hash`); sign-in attempts are rate-limited (5 per 15 min).
- Sign-in is a bearer token sent in the `Authorization` header, not a cookie —
  the same credential works in the browser and in the Android app, whose WebView
  would never send a cookie. Tokens use the selector/validator pattern (only a
  hash of the validator is stored) and are revoked server-side on sign-out.
  Customer tokens last 180 days, staff tokens 30.
- There is no CSRF layer, and none is needed: CSRF defends credentials the
  browser attaches by itself, and nothing attaches an `Authorization` header.
  Requests are sent without credentials, so no cookie can ride along.
- Cross-origin access is a literal allowlist (the Android app's origin plus
  local dev), never a reflection of whatever `Origin` arrives.
- `.htaccess` blocks web access to `includes/`, `vendor/`, `scripts/`,
  and `schema.sql`; `config.php` is never in git.

## Nice next steps (not built yet)

Online payment (Razorpay/UPI), OTP sign-in via SMS/WhatsApp gateway,
delivery-charge rules, GST invoices.

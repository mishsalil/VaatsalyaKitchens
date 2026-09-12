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

### Menu data from Zomato

`database/menu_descriptions.sql`, `menu_additions.sql` and `menu_options.sql` were
generated from the partner-portal export (`Menu-data.xlsx`) and are plain, re-runnable
SQL matched by dish name. Prices follow **policy B**: the site keeps its own base
prices and Zomato's upcharges are applied relative to its cheapest option, so
"Normal" is +0 and the default. The export carries no dish-to-add-on mapping, so the
add-on groups are the kitchen's guess — South Indian sides on dosas, uttapams and
medu vada; Extra Cheese on sandwiches and wraps; Without Vegetables on noodles, fried
rice and the Chinese combos. Change them in Admin → Menu like any other option.

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

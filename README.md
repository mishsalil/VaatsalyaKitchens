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

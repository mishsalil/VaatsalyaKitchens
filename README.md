# Vaatsalya Kitchens — Website

A simple, friendly website for **वात्सल्य Kitchens** (cloud kitchen), designed so
anyone from 12 to 70+ years old can browse and place an order easily.

## Pages

- **`index.html`** — Home page: brand display, services (Small Parties, Kitty
  Parties, Bulk Food Ordering, Daily Meals), how-to-order steps, and contact.
- **`order.html`** — Order page: pick dishes with big **+ / −** buttons, fill in
  simple details, then send the order on **WhatsApp** or **call** directly.
  No backend or account needed.

## Things YOU should update (5 minutes)

1. **Phone / WhatsApp number** — open `js/menu.js` and change:
   - `KITCHEN_WHATSAPP` (digits only, with country code, e.g. `919876543210`)
   - `KITCHEN_PHONE_DISPLAY`
   - Also update the two `tel:+919999999999` links in `index.html` and
     `order.html` (search for `9999999999`).
2. **Menu & prices** — edit the `MENU` list in `js/menu.js`. Add/remove
   categories and items freely; the order page rebuilds itself automatically.
3. **Logo** — `assets/logo.svg` is a hand-drawn recreation of your logo. To use
   your original artwork, save it as `assets/logo.png` and replace the
   `assets/logo.svg` references in both HTML files.
4. **Contact details** — timings and email in the Contact section of
   `index.html`.

## How to publish free with GitHub Pages

1. Merge this branch into `main`.
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` /
   `/ (root)`** → Save.
3. Your site will be live at `https://mishsalil.github.io/VaatsalyaKitchens/`
   within a few minutes. You can later attach a custom domain (e.g.
   `vaatsalyakitchens.in`) from the same settings page.

## How ordering works

The order page builds a neatly formatted order message and opens WhatsApp
(`wa.me`) with it pre-filled — the customer just presses Send. Customers who
prefer talking can tap the big **Call us** button instead. This keeps the site
100% free to run (no server, no database) while you receive orders on the phone
you already use.

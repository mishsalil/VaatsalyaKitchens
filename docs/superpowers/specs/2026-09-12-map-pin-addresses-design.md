# Map-pin addresses: the coordinates are the truth

**Date:** 2026-09-12
**Status:** approved, not yet implemented

## The problem

"Use my current location" is not picking up the right place, and typed
addresses are uncertain. Both complaints have the same root.

Today the flow is: browser GPS fix → OpenStreetMap's Nominatim reverse-geocodes
it → whatever string comes back is dropped into a textarea. In Sitapur OSM
coverage is thin, so the string is often a village three lanes away or just
"Sitapur, Uttar Pradesh". And whichever geocoder we use — Google's data for
Indian towns is far better, but it is still a guess — when it guesses wrong the
customer has no way to say *no, here*.

**The text was being treated as the truth and the coordinates as a by-product.
Zomato and Swiggy do the reverse.** The customer drags a pin onto their gate and
types a house number and a landmark; the rider navigates to the pin. The text
is a label for humans; the coordinates are what gets the food there.

## What is already built, and depended on

- `orders.lat/lng` and `addresses.lat/lng` (`DECIMAL(10,7) NULL`) exist since the
  first schema. **No migration in this change.**
- `web/src/apps/shared/hooks/useGeolocation.ts` — the GPS fix plus Nominatim
  call. The GPS half survives; the Nominatim half is replaced.
- `web/src/apps/storefront/components/AddressPicker.tsx` — pickup / saved / new
  chooser used by `Checkout.tsx`. The "new" branch is what changes.
- `web/src/apps/admin/components/OrderDrawer.tsx:203` — an "Open in Maps" link
  that already appears when an order has coordinates. Today that is only web
  orders whose customer pressed the GPS button.
- The settings table and `/api/me` — how the logo reaches the storefront
  without a rebuild; the API key travels the same road.

## Facts found while designing, which shape the scope

- **Saved addresses have no coordinates.** `MyAccount.tsx:225` stores them with
  `lat: null, lng: null`. A customer who picked a saved address gets no pin, so
  the rider gets no Navigate button. The picker therefore has to reach My
  Account's add-address form too, or the most common path stays broken.
- **Counter orders have no coordinates.** `NewOrder.tsx:457` sends `address_text`
  only, and the create endpoint's INSERT (`api/routes/admin/orders.php:408`) has
  no `lat`/`lng` columns. The server needs to accept them.
- **Nothing in the app handles `maps.app.goo.gl`.** That is the short-link form
  WhatsApp actually sends, and it hides the coordinates behind a redirect.

## Where the API key lives

A `google_maps_key` setting, entered once in **Admin → Settings**, exposed to
the storefront through `/api/me` alongside `logo_path`. Not `VITE_*`, not baked
into the build: the counter phones run a packaged APK, and a key baked in would
mean a new APK to rotate it.

The key is public by design — it runs in the browser — so the restrictions are
what protect it: HTTP referrers `vaatsalyakitchens.in/*` **and `localhost/*`**,
because the Android shell serves the storefront from `https://localhost`. That
second referrer is a small weakening; a daily quota cap on the key in Google
Cloud makes it a non-issue. APIs: Maps JavaScript, Places (New), Geocoding.

**When the setting is blank, the picker degrades to today's behaviour** —
textarea plus GPS — so nothing breaks before the key exists, and the counter's
link-paste and the rider's Navigate button work regardless, because neither
needs the key.

## The customer's picker

Replaces the "new address" branch of `AddressPicker`, and is reused by My
Account's add-address form. Three parts, top to bottom:

1. **A map with a draggable pin.** Opens on the GPS fix, else the address being
   edited, else the kitchen. Dragging the pin is the primary act: its
   coordinates are what is stored. A "Use my location" button re-centres it.
2. **A search box** — Places Autocomplete, biased to a radius around the kitchen
   — for anyone who would rather type a place name. Choosing a result moves
   the pin.
3. **Two fields:** *House / flat / shop* and *Landmark*. When the pin moves, a
   reverse geocode fills a third, read-mostly *Area / street* line as a starting
   point; the customer can overwrite it.

`address_text` is composed from the three: `"<house>, <landmark>, <area>"`,
skipping blanks. Nothing structural is stored beyond what the schema already
has. `lat`/`lng` are always sent when the pin exists.

The geocode is a convenience, never a gate: a customer who drags the pin and
types "Mishra Niwas, near Shiv Mandir" with the geocoded line left empty has
given us everything the rider needs.

## The counter's link paste

A **"Paste maps link"** field on New Order, above the address. It accepts:

- `https://www.google.com/maps?q=27.56,80.68` and `…/maps/search/?api=1&query=27.56,80.68`
- `https://www.google.com/maps/place/…/@27.56,80.68,17z/…`
- `https://maps.google.com/?q=…` and `…/maps/@27.56,80.68,…`
- `https://maps.app.goo.gl/AbCdEf` — the WhatsApp form
- A bare `27.56, 80.68` typed by hand

Parsing is a pure function, `parseMapsLink(text): {lat, lng} | null`, verified
against every shape above. Short links are the one case it cannot resolve
alone: **`POST /api/admin/orders/expand_map_link`** follows the redirect chain
server-side (HEAD-style, no body, five hops max, only to `google.com` /
`goo.gl` hosts) and returns the final URL for the same parser. No API key.

On success the field shows the resolved coordinates and a small map thumbnail
link; the rep still types house and landmark as they do today. The create and
edit endpoints accept `lat`/`lng` and store them.

## The rider's payoff

The existing "Open in Maps" link in `OrderDrawer` becomes a **Navigate** button
using the directions URL (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`),
which opens turn-by-turn in the Maps app on a phone. The same button appears on
the rider's order board. It shows whenever coordinates exist — which, after
this change, is every web order, every saved-address order, and every counter
order whose customer sent a link.

## Verification

This repo has no test framework by design.

- **`web/scripts/verify-maps-link.mjs`** — `parseMapsLink()` against every URL
  shape above, a bare pair, a pair with spaces, swapped-order rejection
  (latitude outside ±90), junk, an empty string, and a short link (must return
  `null`, not a guess — the server resolves those).
- **`scripts/verify-expand-map-link.php`** — the host allowlist and hop cap,
  using a stub resolver so the check never touches the network.
- **`web/scripts/verify-address-text.mjs`** — the compose rule: all three
  parts, each blank in turn, all blank.
- Manual, on a real phone, once the key exists: drag the pin, search, use my
  location, place an order, open it as a rider and tap Navigate.

## Explicitly out of scope

Distance-based delivery charges (the "free within 4 km" rule becomes computable
once every order has a pin, and gets its own change). Editing an existing saved
address's pin (add only; edit follows if wanted). Any map on the customer's
order-tracking page. Storing house/landmark as separate columns.

## What Salil does

Create the Google Cloud project, enable the three APIs, attach billing, create
the key with the referrer restriction and a daily quota, and paste it into
Admin → Settings. Nothing in the customer picker can be tested end to end until
then; the link paste and Navigate button can, and will be.

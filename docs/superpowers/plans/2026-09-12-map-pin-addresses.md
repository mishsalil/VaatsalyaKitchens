# Map-Pin Addresses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coordinates the truth of a delivery address — a draggable pin for customers, a pasted Google Maps link for the counter, a Navigate button for the rider.

**Architecture:** Two pure functions (`parseMapsLink`, `composeAddressText`) carry the logic that can be verified without a browser. A `google_maps_key` setting reaches the storefront via `/api/me`; when blank, the picker falls back to today's textarea. A `MapPinPicker` component wraps the Google Maps JS API (map + draggable marker + Places autocomplete + reverse geocode) and is used by both the checkout `AddressPicker` and My Account's add-address form. The counter gets a link-paste field backed by a tiny redirect-following endpoint for short links. No migration: `orders.lat/lng` and `addresses.lat/lng` already exist.

**Tech Stack:** PHP 8.2 API, React 18 + TypeScript + Vite storefront/admin, Google Maps JavaScript API (Maps, Places New, Geocoding).

**Spec:** `docs/superpowers/specs/2026-09-12-map-pin-addresses-design.md`

## Global Constraints

- **No test framework, by design.** Verification is `node web/scripts/verify-*.mjs` and `php scripts/verify-*.php`. Do not add a runner.
- **No migration.** `orders.lat/lng` and `addresses.lat/lng` (`DECIMAL(10,7) NULL`) already exist.
- **The API key is a setting (`google_maps_key`), never a `VITE_*` build variable** — the counter phones run a packaged APK.
- **Blank key = today's behaviour.** Every customer surface must keep working with no key set.
- **Link paste and Navigate need no key** and must work regardless.
- **Never compare a `?` placeholder to a string literal in SQL** (production collation differs).
- **PHP is `C:\xampp\php\php.exe`; local DB is `vaatsalya_kitchens`.**
- Conventional commits, each ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: `parseMapsLink` — coordinates out of any Google Maps URL

**Files:**
- Create: `web/src/apps/shared/lib/mapsLink.ts`
- Test: `web/scripts/verify-maps-link.mjs`

**Interfaces:**
- Produces: `parseMapsLink(text: string): { lat: number; lng: number } | null`; `isShortMapsLink(text: string): boolean`; `directionsUrl(lat: number, lng: number): string`.

- [ ] **Step 1: Write the failing verification script**

`web/scripts/verify-maps-link.mjs`:

```js
/**
 * Coordinates out of every shape of Google Maps link WhatsApp produces, plus a
 * bare "lat, lng". A short link (maps.app.goo.gl) must return null rather than
 * a guess — the server resolves those by following the redirect.
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/mapsLink.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { parseMapsLink, isShortMapsLink, directionsUrl } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
const P = { lat: 27.5680123, lng: 80.6789456 };

console.log('URL shapes');
check('?q=lat,lng', P, parseMapsLink('https://www.google.com/maps?q=27.5680123,80.6789456'));
check('maps.google.com/?q=', P, parseMapsLink('https://maps.google.com/?q=27.5680123,80.6789456'));
check('search ?api=1&query=', P, parseMapsLink('https://www.google.com/maps/search/?api=1&query=27.5680123%2C80.6789456'));
check('/place/…/@lat,lng,17z', P, parseMapsLink('https://www.google.com/maps/place/Mishra+Niwas/@27.5680123,80.6789456,17z/data=!3m1!4b1'));
check('/maps/@lat,lng,15z', P, parseMapsLink('https://www.google.com/maps/@27.5680123,80.6789456,15z'));
check('/dir/…/destination', P, parseMapsLink('https://www.google.com/maps/dir/?api=1&destination=27.5680123,80.6789456'));
check('!3d lat !4d lng in data blob', P, parseMapsLink('https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d27.5680123!4d80.6789456'));

console.log('\nbare pairs');
check('lat,lng', P, parseMapsLink('27.5680123,80.6789456'));
check('lat, lng with spaces', P, parseMapsLink(' 27.5680123 , 80.6789456 '));
check('negative longitude accepted', { lat: 40.7, lng: -74.0 }, parseMapsLink('40.7,-74.0'));

console.log('\nrefusals');
check('latitude out of range', null, parseMapsLink('80.6789456,27.5680123'.replace('80.6', '95.6')));
check('junk', null, parseMapsLink('call me at 9623836382'));
check('empty', null, parseMapsLink(''));
check('a phone number is not a pair', null, parseMapsLink('96238,36382'));
check('short link returns null, not a guess', null, parseMapsLink('https://maps.app.goo.gl/AbCdEfGh12'));

console.log('\nshort-link detection');
check('maps.app.goo.gl', true, isShortMapsLink('https://maps.app.goo.gl/AbCdEfGh12'));
check('goo.gl/maps', true, isShortMapsLink('https://goo.gl/maps/AbCdEf'));
check('full link is not short', false, isShortMapsLink('https://www.google.com/maps?q=1,2'));
check('junk is not short', false, isShortMapsLink('hello'));

console.log('\ndirections');
check('directions URL', 'https://www.google.com/maps/dir/?api=1&destination=27.5680123%2C80.6789456', directionsUrl(27.5680123, 80.6789456));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && node scripts/verify-maps-link.mjs`
Expected: FAIL — ENOENT, `mapsLink.ts` does not exist.

- [ ] **Step 3: Write `web/src/apps/shared/lib/mapsLink.ts`**

```ts
/**
 * Coordinates out of a Google Maps link — the thing a customer sends the
 * counter over WhatsApp. Pure; verified by web/scripts/verify-maps-link.mjs.
 */

export type LatLng = { lat: number; lng: number };

/** A pair is only accepted when it could be a place on Earth. */
function pair(latS: string, lngS: string): LatLng | null {
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  /* A bare "96238,36382" is a phone number split on the comma, not a place.
     Real coordinates carry decimals; integers only are refused. */
  if (!latS.includes('.') && !lngS.includes('.')) return null;
  return { lat, lng };
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const SHAPES: RegExp[] = [
  new RegExp(`[?&](?:q|query|destination|ll)=${NUM}(?:%2C|,)${NUM}`, 'i'), // ?q= / ?query= / ?destination=
  new RegExp(`/@${NUM},${NUM}`),                                             // /@lat,lng,zoom
  new RegExp(`!3d${NUM}!4d${NUM}`),                                          // data blob
];

/** Coordinates from a full Google Maps URL or a bare "lat, lng". Null when it
 *  cannot say — including short links, which hide the pair behind a redirect. */
export function parseMapsLink(text: string): LatLng | null {
  const s = text.trim();
  if (s === '') return null;

  for (const re of SHAPES) {
    const m = s.match(re);
    if (m) {
      const p = pair(m[1], m[2]);
      if (p) return p;
    }
  }

  const bare = s.match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  if (bare) return pair(bare[1], bare[2]);

  return null;
}

/** maps.app.goo.gl / goo.gl/maps — the shape WhatsApp actually sends. */
export function isShortMapsLink(text: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text.trim());
}

/** Turn-by-turn in the Maps app on a phone, the web on a desktop. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && node scripts/verify-maps-link.mjs`
Expected: `20 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/src/apps/shared/lib/mapsLink.ts web/scripts/verify-maps-link.mjs
git commit -m "feat(addresses): parse coordinates out of any Google Maps link"
```

---

### Task 2: `composeAddressText` — three fields into one line

**Files:**
- Create: `web/src/apps/shared/lib/addressText.ts`
- Test: `web/scripts/verify-address-text.mjs`

**Interfaces:**
- Produces: `composeAddressText(parts: { house: string; landmark: string; area: string }): string`.

- [ ] **Step 1: Write the failing verification script**

`web/scripts/verify-address-text.mjs`:

```js
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/addressText.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { composeAddressText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  if (expected === actual) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${JSON.stringify(expected)}\n         got      ${JSON.stringify(actual)}`); }
};

check('all three', 'Flat 3, Mishra Niwas, near Shiv Mandir, Badaura, Sitapur',
  composeAddressText({ house: 'Flat 3, Mishra Niwas', landmark: 'near Shiv Mandir', area: 'Badaura, Sitapur' }));
check('no landmark', 'Flat 3, Badaura', composeAddressText({ house: 'Flat 3', landmark: '', area: 'Badaura' }));
check('no area (geocoder said nothing)', 'Flat 3, near Shiv Mandir', composeAddressText({ house: 'Flat 3', landmark: 'near Shiv Mandir', area: '' }));
check('house only', 'Flat 3', composeAddressText({ house: 'Flat 3', landmark: '', area: '' }));
check('whitespace-only parts are blank', 'Flat 3', composeAddressText({ house: ' Flat 3 ', landmark: '   ', area: '\t' }));
check('all blank is empty string', '', composeAddressText({ house: '', landmark: '', area: '' }));
check('a trailing comma in a part does not double up', 'Flat 3, Badaura', composeAddressText({ house: 'Flat 3,', landmark: '', area: 'Badaura' }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && node scripts/verify-address-text.mjs`
Expected: ENOENT.

- [ ] **Step 3: Write `web/src/apps/shared/lib/addressText.ts`**

```ts
/**
 * "House, Landmark, Area" — the one address_text column, composed from the
 * three fields the picker shows. Nothing structural is stored; the schema is
 * unchanged. Blank parts are skipped so the line never reads "Flat 3, , ".
 */
export function composeAddressText(parts: { house: string; landmark: string; area: string }): string {
  return [parts.house, parts.landmark, parts.area]
    .map((p) => p.trim().replace(/,+$/, '').trim())
    .filter((p) => p !== '')
    .join(', ');
}
```

- [ ] **Step 4: Run to verify it passes**

Expected: `7 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/src/apps/shared/lib/addressText.ts web/scripts/verify-address-text.mjs
git commit -m "feat(addresses): compose address_text from house, landmark and area"
```

---

### Task 3: Server — the key setting, short-link expansion, counter coordinates

**Files:**
- Modify: `includes/settings.php` (default `google_maps_key`)
- Modify: `api/routes/admin/settings.php` (accept it on `update`)
- Modify: `api/routes/me.php` (expose it)
- Modify: `api/routes/admin/me.php` (expose it — the counter's paste field shows a map thumbnail link only, no key needed; but the admin Settings form reads `all_settings()` already)
- Create: `includes/maps_link.php` (`expand_map_link()` with an injectable resolver)
- Modify: `api/routes/admin/orders.php` (`expand_map_link` action; `lat`/`lng` on create and edit)
- Test: `scripts/verify-expand-map-link.php`

**Interfaces:**
- Produces: setting `google_maps_key`; `POST /api/admin/orders/expand_map_link {url}` → `{url}`; create/edit accept `lat`, `lng` (numeric or absent).
- `expand_map_link(string $url, ?callable $resolveOnce = null): ?string` — follows up to 5 redirects among allowed hosts; `$resolveOnce(string $url): ?string` returns the `Location` header for one hop (null when none). Default resolver uses curl with `CURLOPT_NOBODY`.

- [ ] **Step 1: Write the failing verification script**

`scripts/verify-expand-map-link.php`:

```php
<?php
/* The short-link expander, with a stub resolver so this never touches the
   network. What matters: only Google hosts are followed, the hop cap holds,
   and a chain that ends anywhere else is refused. */
chdir(__DIR__ . '/..');
require 'includes/maps_link.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n", $what, var_export($expected, true), var_export($actual, true)); }
}
/** A resolver over a fixed redirect table. */
function table(array $hops): callable {
    return fn(string $url): ?string => $hops[$url] ?? null;
}

echo "follows a short link to its full form\n";
$r = table(['https://maps.app.goo.gl/AbC' => 'https://www.google.com/maps/place/X/@27.5,80.6,17z']);
check('one hop', 'https://www.google.com/maps/place/X/@27.5,80.6,17z', expand_map_link('https://maps.app.goo.gl/AbC', $r));

$r = table([
    'https://maps.app.goo.gl/AbC' => 'https://goo.gl/maps/Def',
    'https://goo.gl/maps/Def'     => 'https://maps.google.com/?q=27.5,80.6',
]);
check('two hops', 'https://maps.google.com/?q=27.5,80.6', expand_map_link('https://maps.app.goo.gl/AbC', $r));

echo "\nrefusals\n";
check('not a google host to begin with', null, expand_map_link('https://evil.example/x', table([])));
$r = table(['https://maps.app.goo.gl/AbC' => 'https://evil.example/steal']);
check('redirect leaves google — refused', null, expand_map_link('https://maps.app.goo.gl/AbC', $r));
$r = table(['https://maps.app.goo.gl/AbC' => 'https://maps.app.goo.gl/AbC']);
check('loop hits the hop cap', null, expand_map_link('https://maps.app.goo.gl/AbC', $r));
check('no redirect at all returns the url itself', 'https://www.google.com/maps?q=1.5,2.5', expand_map_link('https://www.google.com/maps?q=1.5,2.5', table([])));
check('scheme other than https refused', null, expand_map_link('ftp://maps.app.goo.gl/x', table([])));

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run to verify it fails** — `php scripts/verify-expand-map-link.php` → fatal, file missing.

- [ ] **Step 3: Write `includes/maps_link.php`**

```php
<?php
/* Expanding a maps.app.goo.gl short link into the full URL whose coordinates
   the client can parse. The short form is what WhatsApp actually sends, and
   it hides the pair behind a redirect.

   No API key, no body fetched: a HEAD-style hop that reads only Location. The
   host allowlist and hop cap are the whole security story — this is an
   admin-triggered server-side request, and the only thing it must never do is
   follow a link off Google. */

const MAPS_LINK_MAX_HOPS = 5;

function maps_link_host_allowed(string $url): bool
{
    $p = parse_url($url);
    if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host'])) {
        return false;
    }
    $host = strtolower($p['host']);
    foreach (['google.com', 'google.co.in', 'goo.gl', 'maps.app.goo.gl'] as $ok) {
        if ($host === $ok || str_ends_with($host, '.' . $ok)) {
            return true;
        }
    }
    return false;
}

/** One redirect hop over curl: the Location header, or null when there is none. */
function maps_link_resolve_once(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY         => true,
        CURLOPT_HEADER         => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_USERAGENT      => 'VaatsalyaKitchens/1.0 (+https://vaatsalyakitchens.in)',
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    if (!is_string($raw) || !preg_match('/^Location:\s*(\S+)/im', $raw, $m)) {
        return null;
    }
    return $m[1];
}

/**
 * Follow a short link to its final Google Maps URL. Null when the input is not
 * a Google URL, a hop leaves Google, or the chain does not settle in
 * MAPS_LINK_MAX_HOPS. $resolveOnce is injectable so the verification script
 * never touches the network.
 */
function expand_map_link(string $url, ?callable $resolveOnce = null): ?string
{
    $resolveOnce ??= 'maps_link_resolve_once';
    $current = trim($url);
    for ($hop = 0; $hop <= MAPS_LINK_MAX_HOPS; $hop++) {
        if (!maps_link_host_allowed($current)) {
            return null;
        }
        $next = $resolveOnce($current);
        if ($next === null) {
            return $current;
        }
        if ($hop === MAPS_LINK_MAX_HOPS) {
            return null;
        }
        $current = $next;
    }
    return null;
}
```

- [ ] **Step 4: Run to verify it passes** — expect `7 passed, 0 failed`.

- [ ] **Step 5: The setting.** In `includes/settings.php` `settings_defaults()`, after `'min_order_value' => '199',` add:

```php
        /* Google Maps JavaScript API key for the customer's address picker.
           A SETTING, not a build variable: the counter phones run a packaged
           APK, and baking it in would mean a new APK to rotate it. Blank means
           the picker falls back to a plain textarea. It is public by design (it
           runs in the browser); the referrer restriction in Google Cloud is
           what protects it. */
        'google_maps_key'      => '',
```

In `api/routes/admin/settings.php` `update` action, after the `$gstRate` block:

```php
        $mapsKey = mb_substr(trim((string)($_POST['google_maps_key'] ?? '')), 0, 120);
        if ($mapsKey !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $mapsKey)) {
            Response::error('That does not look like a Google API key.');
        }
```
and alongside the other `set_setting` calls: `set_setting('google_maps_key', $mapsKey);`. Update the docblock's field list at the top of the file.

In `api/routes/me.php`, in the `settings` array after `'logo_path'`: `'google_maps_key' => (string)($s['google_maps_key'] ?? ''),`.

- [ ] **Step 6: The expand action and counter coordinates.** In `api/routes/admin/orders.php`, next to `rating_link`:

```php
    /* --- expand a maps.app.goo.gl short link for the counter's paste field ---
       The client parses coordinates itself; it only needs the full URL. */
    if ($action === 'expand_map_link' && $method === 'POST') {
        require_admin_cap('new_order');
        require_once __DIR__ . '/../../../includes/maps_link.php';
        $url = trim((string)($_POST['url'] ?? ''));
        $full = $url === '' ? null : expand_map_link($url);
        if ($full === null) {
            Response::error('Could not read that link. Paste the full Google Maps link, or the coordinates.');
        }
        Response::json(['url' => $full]);
    }
```

Create path: after `$addressText = …` add
```php
        $lat = is_numeric($_POST['lat'] ?? null) ? (float)$_POST['lat'] : null;
        $lng = is_numeric($_POST['lng'] ?? null) ? (float)$_POST['lng'] : null;
        if (($lat === null) !== ($lng === null) || ($lat !== null && (abs($lat) > 90 || abs($lng) > 180))) {
            Response::error('Location coordinates are incomplete.');
        }
```
Change the `INSERT INTO orders` to include `lat, lng` columns and bind `$lat, $lng` after `$addressText ?: null`. Change the saved-address INSERT from `VALUES (?, ?, ?, NULL, NULL, ?)` to bind `$lat, $lng`.

Edit path: same `$lat/$lng` parsing after its `$addressText`, and add `lat = ?, lng = ?` to the `UPDATE orders SET …` with bindings in the matching position.

- [ ] **Step 7: Lint and run the existing suites**

```bash
php -l includes/maps_link.php && php -l api/routes/admin/orders.php && php -l api/routes/admin/settings.php && php -l api/routes/me.php && php -l includes/settings.php
php scripts/verify-expand-map-link.php
php scripts/verify-review-validation.php
```

- [ ] **Step 8: Commit**

```bash
git add includes/maps_link.php includes/settings.php api/routes/admin/settings.php api/routes/me.php api/routes/admin/orders.php scripts/verify-expand-map-link.php
git commit -m "feat(addresses): google_maps_key setting, short-link expansion, coordinates on counter orders"
```

---

### Task 4: Counter paste field, admin Settings field, rider Navigate

**Files:**
- Modify: `web/src/apps/admin/api/endpoints.ts` (`expandMapLink`)
- Modify: `web/src/apps/admin/pages/NewOrder.tsx` (paste field, `lat`/`lng` in payload and on edit hydrate)
- Modify: `web/src/apps/admin/pages/Settings.tsx` + `web/src/apps/admin/types.ts` (`google_maps_key` field)
- Modify: `web/src/apps/admin/components/OrderDrawer.tsx` (Navigate button)

**Interfaces:**
- Consumes: `parseMapsLink`, `isShortMapsLink`, `directionsUrl` (Task 1); `POST /api/admin/orders/expand_map_link` (Task 3).

- [ ] **Step 1: Endpoint wrapper.** In `endpoints.ts` under `adminOrdersApi`:
```ts
  expandMapLink: (url: string) => adminApi.post('orders/expand_map_link', { url }) as Promise<{ url: string }>,
```

- [ ] **Step 2: NewOrder paste field.** Add state `const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);` and `const [mapsPaste, setMapsPaste] = useState(''); const [mapsMsg, setMapsMsg] = useState<string | null>(null);`. Handler:

```ts
  /* The customer sends a Google Maps link on WhatsApp; the rep pastes it. A
     full link parses locally. A maps.app.goo.gl short link hides the pair
     behind a redirect, so the server follows it and hands back the full URL. */
  const applyMapsPaste = async (text: string) => {
    setMapsPaste(text);
    setMapsMsg(null);
    const direct = parseMapsLink(text);
    if (direct) { setCoords(direct); setMapsMsg(`Pin set: ${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`); return; }
    if (!isShortMapsLink(text)) { if (text.trim()) setMapsMsg('Not a maps link or coordinates'); setCoords(null); return; }
    try {
      const { url } = await adminOrdersApi.expandMapLink(text.trim());
      const p = parseMapsLink(url);
      if (!p) throw new Error('Could not read coordinates from that link');
      setCoords(p); setMapsMsg(`Pin set: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    } catch (e) { setCoords(null); setMapsMsg((e as Error).message); }
  };
```
Render above the Address input:
```tsx
        <label className="block">
          <span className="text-xs font-semibold text-brand-600">Maps link from customer (optional)</span>
          <input value={mapsPaste} onChange={(e) => void applyMapsPaste(e.target.value)} placeholder="Paste a Google Maps link or lat, lng" className={`mt-1 ${inputClass}`} />
          {mapsMsg && (
            <span className={`mt-1 block text-xs ${coords ? 'text-green-700' : 'text-red-600'}`}>
              {mapsMsg}{coords && <> · <a href={directionsUrl(coords.lat, coords.lng)} target="_blank" rel="noopener noreferrer" className="underline">check on map</a></>}
            </span>
          )}
        </label>
```
Payload: add `lat: coords?.lat ?? null, lng: coords?.lng ?? null`. On edit hydrate (where `setAddress(order.address_text ?? '')` runs): `setCoords(order.lat != null && order.lng != null ? { lat: order.lat, lng: order.lng } : null); setMapsPaste(''); setMapsMsg(null);`. On reset (line ~363): `setCoords(null); setMapsPaste(''); setMapsMsg(null);`.

- [ ] **Step 3: Settings field.** In `types.ts` `AdminSettingsFull` add `google_maps_key: string;`. In `Settings.tsx`, include `google_maps_key: form.google_maps_key` in the update payload and add after the GSTIN field:
```tsx
          <Field label="Google Maps API key" htmlFor="k-maps" hint="for the customer's address picker — blank keeps the plain address box">
            <Input id="k-maps" value={form.google_maps_key} onChange={(e) => set('google_maps_key', e.target.value.trim())} placeholder="AIza…" autoComplete="off" />
          </Field>
```
Read `Settings.tsx` first to see how `form` is initialised from the loaded settings and add the key there too.

- [ ] **Step 4: Navigate.** In `OrderDrawer.tsx` line ~203, replace the "Open in Maps →" anchor with:
```tsx
                {order.lat != null && order.lng != null && (
                  <a href={directionsUrl(order.lat, order.lng)} target="_blank" rel="noopener noreferrer"
                     className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-semibold text-cream-50 hover:bg-brand-800">
                    <Navigation className="h-3.5 w-3.5" /> Navigate
                  </a>
                )}
```
importing `Navigation` from lucide-react and `directionsUrl` from `../../shared/lib/mapsLink`.

- [ ] **Step 5: Type-check and build**: `cd web && npx tsc --noEmit && npm run build`.

- [ ] **Step 6: Exercise live.** Start the dev servers; in the admin New Order, paste `https://www.google.com/maps?q=27.5680123,80.6789456` → "Pin set"; paste `96238,36382` → refused; save an order and confirm `lat`/`lng` in the DB; open it in the drawer and see Navigate.

- [ ] **Step 7: Commit**
```bash
git commit -am "feat(admin): paste a customer's maps link at the counter; Navigate for the rider; maps key in Settings"
```

---

### Task 5: `MapPinPicker` — the customer's map

**Files:**
- Create: `web/src/apps/shared/lib/googleMaps.ts` (script loader)
- Create: `web/src/apps/storefront/components/MapPinPicker.tsx`

**Interfaces:**
- Consumes: `settings.google_maps_key` from `useAuth()` (add `google_maps_key?: string` to `Settings` in `web/src/apps/shared/types/index.ts`); `composeAddressText` (Task 2); `useGeolocation` (existing, GPS half).
- Produces: `<MapPinPicker value={AddressDraft} onChange={(d: AddressDraft) => void} />` where `AddressDraft = { house: string; landmark: string; area: string; lat: number | null; lng: number | null }`; and `loadGoogleMaps(key: string): Promise<void>`.

- [ ] **Step 1: The loader** — `web/src/apps/shared/lib/googleMaps.ts`:

```ts
/**
 * Loads the Google Maps JavaScript API once, on demand, with the key from
 * settings. The types are declared minimally here rather than pulling in
 * @types/google.maps: the surface we touch is small and stable.
 */
declare global {
  interface Window { google?: any; __vkMapsReady?: () => void }
}

let pending: Promise<void> | null = null;

export function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    window.__vkMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,geocoding&v=weekly&loading=async&callback=__vkMapsReady`;
    s.async = true;
    s.onerror = () => { pending = null; reject(new Error('Could not load Google Maps')); };
    document.head.appendChild(s);
  });
  return pending;
}
```

- [ ] **Step 2: The picker** — `web/src/apps/storefront/components/MapPinPicker.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useGeolocation } from '../../shared/hooks/useGeolocation';
import { loadGoogleMaps } from '../../shared/lib/googleMaps';
import { Input } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';

export type AddressDraft = { house: string; landmark: string; area: string; lat: number | null; lng: number | null };

/** Sitapur, the kitchen's town — where the map opens before anything is known. */
const KITCHEN = { lat: 27.5679, lng: 80.6817 };

/**
 * The pin is the truth. The customer drags it onto their gate; the fields
 * underneath are a label for humans. A reverse geocode fills "area" as a
 * starting point whenever the pin moves, but it is never a gate: a dragged pin
 * plus "Mishra Niwas, near Shiv Mandir" is a complete address.
 *
 * Renders nothing map-related when no key is set — the parent falls back to a
 * textarea, so this component is only mounted when settings carry a key.
 */
export function MapPinPicker({ value, onChange }: { value: AddressDraft; onChange: (d: AddressDraft) => void }) {
  const { settings } = useAuth();
  const key = settings?.google_maps_key ?? '';
  const mapEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { locate, locating } = useGeolocation();
  const valueRef = useRef(value);
  valueRef.current = value;

  /* Move the pin and tell the parent; then ask the geocoder for a street name
     to seed "area" — only if the customer has not typed their own. */
  const placePin = (lat: number, lng: number, recentre = true) => {
    const pos = { lat, lng };
    markerRef.current?.setPosition(pos);
    if (recentre) mapRef.current?.panTo(pos);
    onChange({ ...valueRef.current, lat, lng });
    const g = window.google;
    if (!g) return;
    new g.maps.Geocoder().geocode({ location: pos }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.[0]) return;
      const area = results[0].formatted_address.replace(/, India$/, '');
      if (valueRef.current.area.trim() === '' || valueRef.current.area === lastGeocoded.current) {
        lastGeocoded.current = area;
        onChange({ ...valueRef.current, lat, lng, area });
      }
    });
  };
  const lastGeocoded = useRef('');

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(key).then(() => {
      if (cancelled || !mapEl.current) return;
      const g = window.google;
      const start = value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : KITCHEN;
      const map = new g.maps.Map(mapEl.current, {
        center: start, zoom: value.lat != null ? 17 : 14,
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
      });
      const marker = new g.maps.Marker({ map, position: start, draggable: true, title: 'Drag me onto your gate' });
      marker.addListener('dragend', () => { const p = marker.getPosition(); placePin(p.lat(), p.lng(), false); });
      map.addListener('click', (e: any) => placePin(e.latLng.lat(), e.latLng.lng(), false));
      mapRef.current = map; markerRef.current = marker;

      /* Places Autocomplete (new). Biased to a radius around the kitchen so
         "Mishra Niwas" finds the one in Sitapur, not Lucknow. */
      if (searchEl.current && g.maps.places?.PlaceAutocompleteElement) {
        const ac = new g.maps.places.PlaceAutocompleteElement({
          locationBias: { center: KITCHEN, radius: 25000 },
          includedRegionCodes: ['in'],
        });
        ac.addEventListener('gmp-select', async (ev: any) => {
          const place = ev.placePrediction.toPlace();
          await place.fetchFields({ fields: ['location'] });
          if (place.location) { placePin(place.location.lat(), place.location.lng()); map.setZoom(17); }
        });
        searchEl.current.replaceChildren(ac);
      }
      setReady(true);
      if (value.lat == null) void onLocate(false);
    }).catch((e: Error) => setLoadError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onLocate = async (announceFailure = true) => {
    try {
      const r = await locate();
      placePin(parseFloat(r.lat), parseFloat(r.lng));
      mapRef.current?.setZoom(17);
    } catch (e) {
      if (announceFailure) setLoadError((e as Error).message);
    }
  };

  const set = (k: 'house' | 'landmark' | 'area') => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <div ref={searchEl} className="[&>gmp-place-autocomplete]:w-full" />
      <div className="relative overflow-hidden rounded-xl border border-cream-200">
        <div ref={mapEl} className="h-56 w-full bg-cream-100 sm:h-64" />
        {!ready && !loadError && <p className="absolute inset-0 flex items-center justify-center text-sm text-brand-500">Loading map…</p>}
        {loadError && <p className="absolute inset-x-0 bottom-0 bg-white/90 p-2 text-center text-xs text-red-600">{loadError}</p>}
        <button type="button" onClick={() => void onLocate()} disabled={locating}
          className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 shadow disabled:opacity-60">
          <Navigation className="h-3.5 w-3.5" /> {locating ? 'Finding…' : 'Use my location'}
        </button>
      </div>
      <p className="text-xs text-brand-500">Drag the pin onto your gate — that is where the rider goes.</p>
      <Field label="House / flat / shop" htmlFor="addr-house"><Input id="addr-house" value={value.house} onChange={set('house')} placeholder="Flat 3, Mishra Niwas" /></Field>
      <Field label="Landmark" htmlFor="addr-landmark"><Input id="addr-landmark" value={value.landmark} onChange={set('landmark')} placeholder="near Shiv Mandir" /></Field>
      <Field label="Area / street" htmlFor="addr-area" hint="filled in from the pin; edit if wrong"><Input id="addr-area" value={value.area} onChange={set('area')} placeholder="Badaura, Sitapur" /></Field>
    </div>
  );
}
```

Read `Input`/`Field` first for their real props (`hint`, `invalid`) and adjust.

- [ ] **Step 3: Settings type.** Add `google_maps_key?: string;` to `Settings` in `web/src/apps/shared/types/index.ts`.

- [ ] **Step 4: Type-check** — `cd web && npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add web/src/apps/shared/lib/googleMaps.ts web/src/apps/storefront/components/MapPinPicker.tsx web/src/apps/shared/types/index.ts
git commit -m "feat(addresses): MapPinPicker — draggable pin, search, use-my-location, three fields"
```

---

### Task 6: Wire the picker into checkout and My Account

**Files:**
- Modify: `web/src/apps/storefront/components/AddressPicker.tsx` (the `new` branch)
- Modify: `web/src/apps/storefront/pages/MyAccount.tsx` (`AddAddressModal`)

**Interfaces:**
- Consumes: `MapPinPicker`, `AddressDraft` (Task 5); `composeAddressText` (Task 2).
- `AddressPayload` is unchanged — `address_text` is composed, `lat`/`lng` from the draft.

- [ ] **Step 1: AddressPicker.** Replace the local `addressText`/`coords` state with `const [draft, setDraft] = useState<AddressDraft>({ house: '', landmark: '', area: '', lat: null, lng: null });` and a helper:
```ts
  const { settings } = useAuth();
  const hasMap = !!settings?.google_maps_key;
  const report = (d: AddressDraft) => { setDraft(d); onChange({ mode: 'new', address_text: composeAddressText(d), lat: d.lat, lng: d.lng }); };
```
In the `mode === 'new'` block: when `hasMap`, render `<MapPinPicker value={draft} onChange={report} />`; otherwise keep the existing GPS button + textarea exactly as today (the textarea writes `house` and the GPS fills `area` + coords, so `composeAddressText` still produces the same line). Remove `onLocate`'s Nominatim-derived text only in the map branch; the fallback keeps it.

- [ ] **Step 2: My Account.** In `AddAddressModal`, when `hasMap`, replace the textarea with `MapPinPicker` over a local `draft`, and save `address_text: composeAddressText(draft), lat: draft.lat, lng: draft.lng`. Validation: refuse to save when `composeAddressText(draft) === ''`. Keep the textarea path when no key.

- [ ] **Step 3: Type-check and build.** `cd web && npx tsc --noEmit && npm run build`.

- [ ] **Step 4: Fallback check in the browser (no key locally).** Load checkout signed in, choose "Use a different address": the textarea and GPS button must appear and behave exactly as before. Then set a throwaway string as `google_maps_key` in the local settings table and reload: the picker mounts, shows "Loading map…", then the load error (bad key) — and the fields underneath still work. Clear the setting afterwards.

- [ ] **Step 5: Commit**
```bash
git commit -am "feat(addresses): the map-pin picker at checkout and in My Account, textarea fallback without a key"
```

---

### Task 7: Verification record and README

- [ ] **Step 1: Run everything**
```bash
cd web && node scripts/verify-maps-link.mjs && node scripts/verify-address-text.mjs && node scripts/verify-rate-lines.mjs && npx tsc --noEmit && npm run build
cd .. && php scripts/verify-expand-map-link.php && php scripts/verify-review-validation.php && php scripts/verify-review-clocks.php
```
- [ ] **Step 2: README** — a short "Address picker (Google Maps)" section: which three APIs, the referrer restriction including `localhost/*`, the daily quota, where the key is pasted, and that a blank key means the plain textarea.
- [ ] **Step 3: Commit** `docs(addresses): maps key setup`.

## Operator steps this plan cannot perform

1. Google Cloud project; enable Maps JavaScript API, Places API (New), Geocoding API; billing; key restricted to those APIs and referrers `vaatsalyakitchens.in/*` + `localhost/*`; daily quota.
2. Paste the key into Admin → Settings.
3. Test the picker on a real phone; build a new APK for the counter phones (the paste field and Navigate are in the admin bundle).

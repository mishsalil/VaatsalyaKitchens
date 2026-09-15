# Checkout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validation errors focus their field, desktop pages use 80 rem, and checkout defaults to ASAP with a calendar + grouped time picker behind a "Schedule for later" toggle.

**Architecture:** Pure helpers in `shared/lib` (`focusError.ts`, `timeSlots.ts` additions) verified by esbuild scripts; presentational components in `storefront/components` (`Calendar`, `TimePicker`, `WhenCard`); `Checkout.tsx` wires them. No API change.

**Tech Stack:** React 18 + TS + Tailwind; `web/scripts/verify-*.mjs`; `npx tsc --noEmit -p .` in `web/`.

**Spec:** `docs/superpowers/specs/2026-09-15-checkout-polish-design.md`

## Global Constraints

- Tailwind classes only; match the `chip` / `chip-active` / `card-soft` idiom in `web/src/index.css`.
- The Browser pane cannot test scroll — verify `focusFirstError` by checking `document.activeElement` via `javascript_tool`, not by screenshot.
- Commit after every task.

---

### Task 1: `focusFirstError` + server-message map

**Files:**
- Create: `web/src/apps/shared/lib/focusError.ts`, `web/scripts/verify-focus-map.mjs`

```ts
export function focusFirstError(ids: string[]): boolean {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const native = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement;
    if (!native && el.tabIndex < 0) el.tabIndex = -1;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}
export type CheckoutFieldKey = 'name' | 'phone' | 'when' | 'address' | 'order' | 'code' | 'form';
/** Which field a server refusal belongs to — the sentences are the server's own fixed strings. */
export function checkoutFieldFor(message: string, appliedCode?: string | null): CheckoutFieldKey {
  const m = message.toLowerCase();
  if (appliedCode && message.includes(appliedCode)) return 'code';   // before 'phone': "Enter your phone number to use WELCOME."
  if (m.includes('your name')) return 'name';
  if (m.includes('phone number')) return 'phone';
  if (m.includes('when you need the food') || m.startsWith('we are closed')) return 'when';
  if (m.includes('address')) return 'address';
  if (m.includes('at least one dish') || m.startsWith('please choose')) return 'order';
  if (/\bcode\b/.test(m)) return 'code';
  return 'form';
}
```

- [ ] failing `verify-focus-map.mjs` (one check per row of the spec table, plus `("Enter your phone number to use WELCOME.", "WELCOME")` → `code` and `("Please write a 10-digit phone number.", "WELCOME")` → `phone`) → implement → pass → commit `feat(web): focusFirstError and the checkout field map`.

---

### Task 2: Checkout errors land on the field

**Files:**
- Modify: `web/src/apps/storefront/pages/Checkout.tsx`, `web/src/apps/storefront/components/OffersCard.tsx` (accept `error?: string` prop rendered under the code box; root element `id="offers-field"`), `web/src/apps/shared/components/ui/FormError.tsx` (`id` prop), `web/src/apps/shared/components/ui/Field.tsx` (export a `FieldError({ message })` component used by `Field` and by the cards). Anchors per spec: `order-field`, `address-field`, `when-field`, `cust-name`, `cust-phone`, `offers-field`, `form-error`.

- [ ] `placeOrder`: run every client check, set every message, then `focusFirstError(['order-field','address-field','when-field','cust-name','cust-phone','offers-field'])` in page order. Catch block: `const key = checkoutFieldFor(msg, applied?.code)`; set the matching state (`orderErr`, `addressErr`, `whenErr`, `nameErr`, `phoneErr`, `codeErr` + drop `applied`, or `formError`) and focus its anchor. Keep `toast.error`. Cards render their error with `FieldError` under the heading.
- [ ] tsc; browser-pane: submit with an empty name → `document.activeElement.id === 'cust-name'`. Commit `feat(checkout): errors take you to the field`.

---

### Task 3: Admin New Order — per-field errors

**Files:** `web/src/apps/admin/pages/NewOrder.tsx:582-586` — replace the four `return setError(...)` with `nameErr/phoneErr/whenErr/linesErr` state rendered under the respective inputs (ids `no-name`, `no-phone`, `no-when`, `no-lines`), then `focusFirstError([...])`; clear each on change. Server errors keep `setError`.

- [ ] tsc; commit `feat(admin): new-order errors sit on the field`.

---

### Task 4: Width

**Files:** `web/src/index.css:28` (`max-w-7xl`), `web/src/apps/storefront/pages/Order.tsx:132,152` (`[1fr_22rem]`, `[14rem_1fr_22rem]`), `web/src/apps/storefront/pages/MyAccount.tsx:44` (`container-wide`), `Checkout.tsx` outer grid `lg:grid-cols-[1fr_26rem]` (was `md:`; keep `items-start`), and a `lg:grid-cols-2` inner block below "Your order" (left: When + Delivery; right: Contact + Anything else). The aside stays sticky at `lg`. The `md:hidden` upsell becomes `lg:hidden` and its desktop twin `hidden lg:block`.

- [ ] tsc; browser-pane at 1440×900 screenshot of `/order` and `/checkout`; at 390 wide nothing overflows horizontally (`document.documentElement.scrollWidth === innerWidth`). Commit `feat(web): use the full 80 rem on desktop`.

---

### Task 5: Time-slot helpers

**Files:** `web/src/apps/shared/lib/timeSlots.ts`, `web/scripts/verify-time-slots.mjs`

```ts
export const MAX_AHEAD_MONTHS = 12;
export const ASAP_TEXT = 'As soon as possible';
export function asapAt(now: Date): Date {
  const t = new Date(now.getTime() + LEAD_MINUTES * 60_000);
  t.setSeconds(0, 0);
  const m = t.getMinutes();
  if (m % 5) t.setMinutes(m + (5 - (m % 5)));
  return t;
}
export type DayCell = { date: string; day: number; disabled: boolean; today: boolean } | null;
export function monthCells(ym: string, hours: MenuHours | undefined, now: Date): DayCell[] {
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const daysIn = new Date(y, mo, 0).getDate();
  const todayIso = isoDate(now);
  const max = new Date(now.getFullYear(), now.getMonth() + MAX_AHEAD_MONTHS, now.getDate());
  const cells: DayCell[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysIn; d++) {
    const dt = new Date(y, mo - 1, d);
    const iso = isoDate(dt);
    cells.push({ date: iso, day: d, today: iso === todayIso,
      disabled: iso < todayIso || dt > max || windowsOn(hours, dt.getDay()).length === 0 });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}
export function slotGroups(slots: string[]): { label: string; slots: string[] }[] {
  const g = { Morning: [] as string[], Afternoon: [] as string[], Evening: [] as string[] };
  for (const s of slots) { const h = Number(s.slice(0, 2)); (h < 12 ? g.Morning : h < 17 ? g.Afternoon : g.Evening).push(s); }
  return Object.entries(g).filter(([, v]) => v.length).map(([label, slots]) => ({ label, slots }));
}
/** "Sat 19 Sep, 7:30 PM" for the When card's summary line. */
export function describeSlot(date: string, time: string): string
```

  `firstAvailable` → `dayOptions(hours, now, 14)`.

- [ ] failing checks per the spec's Verification list (asapAt 12:41 → 13:25 and 12:20 → 13:00; Sept 2026 → 2 leading blanks, 42 cells, Sundays disabled with the fixture, yesterday disabled, +13 months disabled; slotGroups buckets `['09:00','12:00','16:30','17:00']` → Morning 1 / Afternoon 2 / Evening 1; firstAvailable finds a day 10 days out when the first nine are closed; describeSlot) → implement → pass (update the fixture's count line) → commit `feat(web): asapAt, monthCells, slotGroups, describeSlot`.

---

### Task 6: Calendar, grouped TimePicker, WhenCard, Checkout wiring

**Files:**
- Create: `web/src/apps/storefront/components/Calendar.tsx` (props `{ hours?, value, onChange, now?: Date }`; internal `ym` state starting at the value's month or now; header `‹ September 2026 ›` with the arrows disabled outside [now's month, now + 12 months]; weekday row `Su Mo … Sa`; 7-col grid of `monthCells`; cell classes: disabled `text-brand-300`, today `ring-1 ring-brand-400`, selected `bg-brand-700 text-white`; `aria-pressed`), `web/src/apps/storefront/components/WhenCard.tsx` (props `{ hours, scheduled, onScheduled, date, time, onDate, onTime, error, forced }`; toggle row per spec — a `role="switch"` button; when `forced` the switch is on and disabled with the line *The kitchen is closed right now — pick a time.*; `id="when-field"`).
- Modify: `TimePicker.tsx` (render `slotGroups` with a small uppercase heading per group), `Checkout.tsx` (state `scheduled` initial `false`; `forced = !!hours && !kitchenOpenAt(hours, asapAt(now))` — when it becomes true set `scheduled`; `whenLocal` = scheduled ? `toLocalValue(date, time)` : local ISO of `asapAt(new Date())` at submit time; `needed_on` = scheduled ? `formatNeededOn(whenLocal)` : `ASAP_TEXT`; the preselect effect only runs when `scheduled`), delete `DatePicker.tsx` and its import.
- [ ] tsc; browser-pane: default shows the ASAP row and no pickers; toggle → calendar and grouped chips; pick a date next month → the summary text updates; commit `feat(checkout): ASAP by default, calendar and grouped times behind Schedule for later`.

---

### Task 7: Docs

- [ ] README checkout section (ASAP default, calendar to 12 months, errors focus fields, 80 rem); spec status implemented; commit `docs: checkout polish`.

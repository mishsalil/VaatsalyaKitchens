# Checkout polish: errors that take you there, wider pages, ASAP by default

**Date:** 2026-09-15
**Status:** implemented
**Builds on:** `2026-09-12-menu-cart-checkout-design.md`

## What Salil asked for

1. When a form refuses, take the customer to the field and say why there.
2. Stop wasting the side margins on desktop — Menu and Checkout are cramped
   in the middle with blank columns either side.
3. Don't show a date and time at all unless the customer chooses *Schedule
   for later*; by default the order is "now". When they do schedule, give
   them a real calendar (bulk bookings run months ahead) and a nicer time
   picker. The same picker will serve the bulk-order menu later.

## 1. Errors take you to the field

`web/src/apps/shared/lib/focusError.ts`:

```ts
/** Scrolls the first existing element into view (centred) and focuses it. Returns true when one was found. */
export function focusFirstError(ids: string[]): boolean
```

Uses `scrollIntoView({ block: 'center', behavior: 'smooth' })` then
`focus({ preventScroll: true })`; non-focusable anchors (a section) get
`tabIndex=-1` so focus lands and screen readers announce the error.

**Checkout.** Anchors: `cust-name`, `cust-phone` (inputs), `when-field`
(the When card), `address-field` (the Delivery card), `order-field` (Your
order card), `offers-field` (the Offers card), `form-error` (the top
`FormError`). Client-side validation runs all checks, sets every message,
then calls `focusFirstError` in page order. A server 422 is mapped by its
text — the messages are the server's own fixed sentences — to the same
anchors:

| message contains | field |
|---|---|
| `your name` | name |
| `phone number` | phone |
| `when you need the food`, `We are closed` | when (`whenErr`) |
| `address` | address (`addressErr`, new) |
| `choose at least one dish`, `Please choose` | order (`orderErr`, new) |
| the applied code's text, or `code` | offers (code dropped, `codeErr` shown in the card) |
| anything else | `form-error` |

`Field` already renders `error`; the When, Delivery and Order cards render
theirs with the same `role="alert"` block under the heading.

**Admin → New Order** gets the same treatment for its four checks (name,
phone, when, lines): the message moves next to the field (`nameErr`,
`phoneErr`, `whenErr`, `linesErr`) and the first is focused; the summary
`error` line stays for server messages.

Login and Rate are single-field forms whose error already sits under the
field — no change.

## 2. Width

`.container-wide` → `max-w-7xl` (80 rem; nothing wider — long lines read
badly). Grids that used the old width:

- Order page: `lg:grid-cols-[14rem_1fr_22rem]`; the search+category row
  above it `lg:grid-cols-[1fr_22rem]`. The menu column gets the extra width.
- Checkout: outer `lg:grid-cols-[1fr_26rem]`; inside the form, below "Your
  order", a `lg:grid-cols-2` block: left = When + Delivery, right = Contact
  + Anything else. On `md` and below everything stacks as today.
- Home keeps its two-column hero and simply gets wider.
- `MyAccount` moves from `container-page` to `container-wide`.

## 3. When: ASAP unless scheduled

**Timing lib** (`shared/lib/timeSlots.ts`):

```ts
export const MAX_AHEAD_MONTHS = 12;
/** now + LEAD_MINUTES, snapped UP to 5 minutes. */
export function asapAt(now: Date): Date
/** "As soon as possible (about 40 min)" — the needed_on text for an ASAP order. */
export const ASAP_TEXT = 'As soon as possible';
export type DayCell = { date: string; day: number; disabled: boolean; today: boolean } | null;  // null = leading/trailing blank
/** Six rows of seven for the month containing `ym` (YYYY-MM). Disabled: before today, after today+12 months, or a weekday the kitchen never opens. */
export function monthCells(ym: string, hours: MenuHours | undefined, now: Date): DayCell[]
/** 'Morning' (< 12:00) | 'Afternoon' (12:00–16:59) | 'Evening' (≥ 17:00). */
export function slotGroups(slots: string[]): { label: string; slots: string[] }[]
```

`firstAvailable` searches 14 days instead of 7 (a kitchen shut for a week
still gets a default). `dayOptions` stays for that search only.

**Checkout "When" card.** One row:

> ⏱ **Ready in about 40 min** · *Schedule for later* [toggle]

- Toggle off (default): posts `needed_at = asapAt(now)` and
  `needed_on = ASAP_TEXT`. Nothing else rendered.
- Toggle on: the row becomes *Scheduled* · summary text (e.g. "Sat 19 Sep,
  7:30 PM") and the card expands with **Calendar** (month grid, ‹ › month
  arrows, today outlined, disabled cells greyed, picked cell filled) and
  **TimePicker** (grouped chips under Morning / Afternoon / Evening
  headings; groups with no slots omitted).
- If `asapAt(now)` is outside kitchen hours, the toggle is on and locked
  with the line *"The kitchen is closed right now — pick a time."*
- `hours` unconfigured → ASAP always allowed.
- Validation: scheduled and no time → *Please tell us when you need the
  food.* (existing); ASAP but kitchen closed → forced schedule, so the same
  message.
- The self-heal in `TimePicker` stays.

**Server** (`api/routes/orders.php`): no change — it already validates
`needed_at` against hours and stores `needed_on` free text; "As soon as
possible" prints on slips as is.

**Components.** `Calendar.tsx` replaces `DatePicker.tsx` (deleted);
`TimePicker.tsx` gains groups; new `WhenCard.tsx` owns the toggle and the
two pickers with props `{ hours, scheduled, onScheduled, date, time, onDate,
onTime, error }`. The bulk menu will reuse `Calendar` + `TimePicker`.

**Admin → New Order** keeps its own free-text "when" field (counter reps
type); out of scope.

## Verification

- `web/scripts/verify-time-slots.mjs`: `asapAt` snapping (12:41 → 13:25;
  12:20 → 13:00), `monthCells` (Sept 2026 starts on Tuesday → 2 blanks;
  Sundays disabled with the fixture hours; yesterday disabled; a date 13
  months out disabled; 42 cells), `slotGroups` buckets, `firstAvailable`
  over 14 days.
- `web/scripts/verify-focus-map.mjs`: the server-message → anchor table.
- `npx tsc --noEmit -p .`; browser-pane check of checkout at desktop and
  mobile widths (ASAP row, toggle on → calendar, error focus on an empty
  name), Order page at 1440 px.

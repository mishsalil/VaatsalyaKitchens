# Printing receipts on the counter's Bluetooth thermal printer

**Date:** 2026-09-09
**Status:** approved, not yet implemented

## The problem

The counter has a **Posiflow PT-210**, a 58mm Bluetooth thermal printer. Today
the admin can open `/admin/orders/:id/print`, which renders an A4 page and calls
`window.print()`. On a counter phone that means the Android print dialog, a
driver that may not exist, and a page sized for paper the printer does not have.

What the counter needs is what a real point of sale does: save the order, and the
receipt comes out. One tap or none, no dialog.

## What is already built

Committed in `2b731bf`, and this design depends on it:

- `web/src/apps/shared/lib/receiptText.ts` — the bill as plain text in fixed
  columns, 32 at 58mm and 48 at 80mm. Pure function, no DOM. **This is already
  the payload**: an ESC/POS receipt is exactly these characters.
- `web/src/apps/shared/lib/whatsappSlip.ts` — the proportional slip for WhatsApp.
  Not involved in printing.
- `web/src/apps/admin/hooks/usePaperSetting.ts` — paper width, stored per device.
- `web/scripts/verify-receipt-text.mjs` — 24 checks over the formatters.

## The device, measured not assumed

Read from the paired Galaxy S10 Lite on 2026-09-09 with
`adb shell dumpsys bluetooth_manager`:

```
86:67:7A:F3:10:33  [ DUAL ]  PT-210_1033
                   (00001101-0000-1000-8000-00805f9b34fb)
```

- **DUAL** — the radio does Classic and LE both.
- It advertises **exactly one service**, the Serial Port Profile UUID. There is
  no GATT printing service.
- Class of device `0x40680`: major class 6, *Imaging*.

**So the transport is Bluetooth Classic RFCOMM, and that is not a preference.**
SPP is the only printing interface the device offers. It also happens to be the
safer half: BLE would mean splitting a ~2KB receipt into 20-byte writes with
chipset-specific flow control, which is the failure mode that half-prints a bill.

A BLE path will not be built. If a future printer forces one, that is a new
design.

## Architecture

### Why a plugin of our own

Not a community Bluetooth-printer plugin. The stack is Capacitor 8.5 on
`targetSdk 36`, and the push plugin already had to be worked around this week —
it declares `firebase-messaging` as `implementation`, hiding it from the app
module, so the version had to be pinned by hand in `variables.gradle`. A
third-party plugin that has not kept up with Capacitor 8 would fight that build
for more effort than the ~200 lines it saves.

`DndAccessPlugin.java` is the precedent in this repo and this follows it exactly:
a `@CapacitorPlugin` class, registered in `MainActivity.onCreate` **before**
`super.onCreate()`, with a thin typed wrapper on the TypeScript side.

### Components

```
web/src/apps/shared/lib/receiptText.ts     (exists) bill  -> string
web/src/apps/shared/lib/kitchenTicket.ts   (new)    order -> Block[]
web/src/apps/shared/lib/escpos.ts          (new)    Block[] -> bytes
web/src/apps/shared/print/thermalPrinter.ts(new)    typed bridge to the plugin
web/src/apps/admin/hooks/usePrinterSetting.ts (new) which printer, auto-print
android/.../ThermalPrinterPlugin.java      (new)    RFCOMM transport
```

Each has one job. The formatters and the encoder are pure and testable without
hardware; only the Java file touches Bluetooth.

### The native plugin

`@CapacitorPlugin(name = "ThermalPrinter")`, three methods:

| method | does | resolves |
|---|---|---|
| `listPaired()` | bonded devices whose UUIDs include SPP | `{ devices: [{ name, address }] }` |
| `print({ address, bytes })` | RFCOMM connect, write, close | `{ ok: true }` or rejects with a reason |
| `ensurePermission()` | requests `BLUETOOTH_CONNECT` | `{ granted: boolean }` |

`bytes` crosses the bridge as a **base64 string** — the Capacitor bridge is JSON,
so a byte array would arrive as a list of numbers and cost far more to serialize.

Connection is opened per print and closed after. A held-open socket is the thing
that goes stale when the printer sleeps, and a receipt is small enough that the
reconnect cost is invisible. Writes are wrapped so a `IOException` becomes a
rejected call with a readable reason rather than a crash.

**Permissions.** Android 12+ needs `BLUETOOTH_CONNECT` as a runtime permission;
older versions need `BLUETOOTH` and `BLUETOOTH_ADMIN` declared with
`android:maxSdkVersion="30"`. Only bonded devices are used, so `BLUETOOTH_SCAN`
is not required and will not be requested — the printer is paired once in Android
settings, the way the counter phone is already set up for Do Not Disturb access.

### Encoding

`escpos.ts` turns blocks into bytes:

```ts
type Block = { text: string; size?: 'normal' | 'double' };
encode(blocks: Block[]): Uint8Array
```

- `ESC @` to initialise, so a previous job cannot leave the printer in a strange
  mode.
- `ESC ! 0x10` / `ESC ! 0x00` around a `double` block, for the kitchen ticket.
- Body as ASCII. **Anything outside ASCII is replaced with `?`** rather than sent
  raw: the printer's code page is CP437-ish and the Devanagari in the letterhead
  would otherwise print as noise. `receiptText.ts` already avoids the rupee sign
  for the same reason.
- Four line feeds at the end, so the last line clears the tear bar. The PT-210
  has no cutter, so no cut command is sent.

### What comes out

Chosen at print time, per order: **Bill**, **Kitchen ticket**, or **Both**.

- **Bill** — `receiptText.ts`, unchanged. Its string becomes a single
  `{ text, size: 'normal' }` block.
- **Kitchen ticket** — `kitchenTicket.ts`, which returns blocks rather than a
  string because it mixes sizes: order number and time needed at normal size,
  then items and quantities at double height. No prices, no GST, no letterhead.
  It exists to be read at arm's length across a hot counter, and prices on it are
  noise.

`ESC ! 0x10` doubles height only, not width, so a double block still fits the
same 32 columns and the width checks hold for both documents.

### Settings, per device

Stored in `localStorage` beside the existing paper choice, for the reason already
established there: a printer belongs to a counter phone, not to the business, so
two devices must be able to differ.

- `vk-printer` — `{ name, address }` of the chosen printer
- `vk-print-auto` — auto-print on save

**Auto-print defaults off until a printer has been chosen**, then on. A device
with no printer configured would otherwise raise an error on every saved order.

### Flow

1. Counter saves an order. **The order is saved before anything prints** — the
   printer is never in the path of recording a sale.
2. If auto-print is on and a printer is set, the app encodes the chosen documents
   and calls `print`.
3. Success: a quiet confirmation.
4. Failure: a toast naming the reason, and a **Reprint** button that stays on the
   saved-order screen. The counter is told, and can retry after switching the
   printer on, without re-entering anything.

### On the web

`isNativePlatform()` is false in a browser, so the printer controls are hidden
and `/admin/orders/:id/print` keeps `window.print()` and the copy buttons. The
bridge module must degrade rather than throw — a desktop admin opening the print
page must not meet an error about Bluetooth.

## What can go wrong, and what happens

| situation | behaviour |
|---|---|
| Printer off, asleep, or out of range | `connect` throws; call rejects; toast + Reprint |
| `BLUETOOTH_CONNECT` denied | Printing disabled with an explanation, not a silent no-op |
| No printer chosen | Auto-print stays off; the picker is offered |
| Printer out of paper | **Not detected.** SPP gives no status without an ESC/POS query, and this design does not add one. The counter sees a successful print and no paper. Accepted for now; revisit if it bites |
| Bluetooth off entirely | Reported as a distinct reason so the fix is obvious |
| Two documents, first succeeds, second fails | Reported per document, so nobody reprints a bill that already printed |

## Verification

**Without hardware** — extends `verify-receipt-text.mjs`:

- encoder emits `ESC @` first and ends with the feed
- ASCII maps byte-for-byte; a Devanagari letterhead becomes `?`, never raw UTF-8
- `double` blocks are wrapped in the size command and returned to normal after
- the kitchen ticket contains every item and quantity, no price, no GST line
- no ticket line exceeds the column width

**With hardware** — the S10 Lite (already paired to `PT-210_1033`) plugged in:

1. `listPaired()` returns the PT-210 and nothing irrelevant
2. a real order prints as a bill, legibly, at 32 columns
3. the kitchen ticket prints double-height
4. printer switched off mid-test: the counter sees a reason and a Reprint, and
   the order is still saved

## Deliberately out of scope

- BLE. The device offers no GATT printing service.
- Paper-out and error status queries.
- Printing from the customer app or a browser.
- A cutter command. This printer has none.
- Logos or barcodes. Text first; images are a separate ESC/POS mode and nobody
  has asked for one.

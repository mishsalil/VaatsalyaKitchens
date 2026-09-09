# Thermal Printer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print order receipts from the Android counter app straight to the Posiflow PT-210 over Bluetooth, with no dialog.

**Architecture:** Pure TypeScript formatters turn an order into fixed-column text, an encoder turns that into ESC/POS bytes, and a small Capacitor plugin of our own writes those bytes to a Bluetooth Classic RFCOMM socket. Everything except the Java file is testable without hardware. The order is always saved before anything prints, so a dead printer costs a receipt and never a sale.

**Tech Stack:** TypeScript, React 18, Capacitor 8.5, Android `targetSdk 36`, Java 21, plain `node --test`-free verification scripts run with `node`.

**Spec:** `docs/superpowers/specs/2026-09-09-thermal-printer-design.md`

## Global Constraints

- **Transport is Bluetooth Classic RFCOMM only.** No BLE path. The device advertises only SPP: `00001101-0000-1000-8000-00805f9b34fb`.
- **Target printer:** `PT-210_1033`, MAC `86:67:7A:F3:10:33`, already paired to the Galaxy S10 Lite (`SM-G770F`).
- **Paper:** 58mm = **32 columns**; 80mm = **48 columns**. From `columnsFor()` in `receiptText.ts`.
- **No non-ASCII bytes ever reach the printer.** Anything outside `0x20`–`0x7e` becomes `?` (`0x3f`). Newline `0x0a` passes through.
- **This repo has no test framework.** Verification is `node scripts/verify-*.mjs` and `php scripts/verify-*.php`, following the existing convention. Do not add vitest/jest.
- **TypeScript is compiled for verification with esbuild**, already a dependency — see `web/scripts/verify-receipt-text.mjs` for the loader to copy.
- **Plugins must be registered before `super.onCreate()`** in `MainActivity`, or they are invisible to JavaScript.
- **Every commit runs `npx tsc --noEmit` clean** from `web/`.
- Android build needs `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"`. Studio's JDK 25 fails.

---

### Task 1: ESC/POS encoder

**Files:**
- Create: `web/src/apps/shared/lib/escpos.ts`
- Create: `web/scripts/verify-print-payload.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Block { text: string; size?: 'normal' | 'double' }`
  - `export function encode(blocks: Block[]): Uint8Array`
  - `export function toBase64(bytes: Uint8Array): string`

- [ ] **Step 1: Write the failing checks**

Create `web/scripts/verify-print-payload.mjs`:

```js
/**
 * Checks the bytes we hand to the printer. A receipt that looks right on screen
 * and prints as noise is the failure this guards against.
 * Run: node scripts/verify-print-payload.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

async function loadTs(tsPath, outName, dir) {
  const src = readFileSync(new URL(tsPath, import.meta.url), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });
  const out = join(dir, outName);
  writeFileSync(out, code);
  return pathToFileURL(out).href;
}

const dir = mkdtempSync(join(tmpdir(), 'vk-print-'));
const esc = await import(await loadTs('../src/apps/shared/lib/escpos.ts', 'escpos.mjs', dir));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

console.log('escpos.encode');
const simple = esc.encode([{ text: 'Hi' }]);
check('starts with ESC @ (initialise)', simple[0] === 0x1b && simple[1] === 0x40);
check('maps ASCII byte for byte', simple[2] === 0x48 && simple[3] === 0x69);
check('ends with four line feeds',
  Array.from(simple.slice(-4)).every((b) => b === 0x0a));

const devanagari = esc.encode([{ text: 'वात्सल्य Kitchens' }]);
check('no byte above 0x7e survives',
  Array.from(devanagari).every((b) => b <= 0x7e),
  'a non-ASCII byte reached the printer');
check('non-ASCII becomes a question mark', Array.from(devanagari).includes(0x3f));

const big = Array.from(esc.encode([{ text: 'KOT', size: 'double' }]));
const dblOn = big.findIndex((b, i) => b === 0x1b && big[i + 1] === 0x21 && big[i + 2] === 0x10);
const dblOff = big.findIndex((b, i) => b === 0x1b && big[i + 1] === 0x21 && big[i + 2] === 0x00);
check('double block opens with ESC ! 0x10', dblOn > -1);
check('double block returns to normal after', dblOff > dblOn);

const multi = Array.from(esc.encode([{ text: 'a' }, { text: 'b' }]));
check('each block ends with a newline',
  multi.filter((b) => b === 0x0a).length >= 2);

const embedded = Array.from(esc.encode([{ text: 'one\ntwo' }]));
check('newlines inside a block pass through', embedded.filter((b) => b === 0x0a).length >= 2);

console.log('\nescpos.toBase64');
const b64 = esc.toBase64(new Uint8Array([0x1b, 0x40, 0x41]));
check('round-trips through base64', Buffer.from(b64, 'base64').toString('hex') === '1b4041', b64);
const large = esc.toBase64(new Uint8Array(100000).fill(0x41));
check('survives a payload larger than the argument limit', large.length > 100000);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd web && node scripts/verify-print-payload.mjs
```

Expected: FAIL — `Cannot find module .../escpos.ts` (the file does not exist yet).

- [ ] **Step 3: Write the encoder**

Create `web/src/apps/shared/lib/escpos.ts`:

```ts
/**
 * Turns receipt text into the bytes an ESC/POS printer understands.
 *
 * WHY NON-ASCII IS REPLACED RATHER THAN SENT. The PT-210, like most 58mm
 * printers, decodes bytes through a CP437-ish code page: it has no idea what
 * UTF-8 is. A Devanagari letterhead sent raw prints as a run of random glyphs,
 * which looks like a broken printer rather than a wrong encoding. A question
 * mark is honest.
 */

const ESC = 0x1b;
const LF = 0x0a;

/** A run of text at one size. Blocks exist because a kitchen ticket mixes a
 *  normal-size header with double-height items. */
export interface Block {
  text: string;
  size?: 'normal' | 'double';
}

/** ESC ! n — bit 4 sets double height. Width is untouched, so a double block
 *  still fits the same column count. */
const SIZE_DOUBLE = [ESC, 0x21, 0x10];
const SIZE_NORMAL = [ESC, 0x21, 0x00];

export function encode(blocks: Block[]): Uint8Array {
  const bytes: number[] = [ESC, 0x40]; // ESC @ — clear any state a previous job left

  for (const block of blocks) {
    if (block.size === 'double') bytes.push(...SIZE_DOUBLE);

    // for..of walks code points, so a surrogate pair is one iteration and
    // cannot be split into two stray bytes.
    for (const ch of block.text) {
      if (ch === '\n') {
        bytes.push(LF);
        continue;
      }
      const code = ch.codePointAt(0) ?? 0x3f;
      bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
    }

    bytes.push(LF);
    if (block.size === 'double') bytes.push(...SIZE_NORMAL);
  }

  // Feed the last line past the tear bar. This printer has no cutter, so there
  // is no cut command to send.
  bytes.push(LF, LF, LF, LF);

  return new Uint8Array(bytes);
}

/**
 * Base64 for the Capacitor bridge, which is JSON — a byte array would cross as
 * a list of numbers and cost several times the size.
 *
 * Chunked because String.fromCharCode(...bytes) on a whole receipt can exceed
 * the JavaScript engine's argument limit and throw.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
```

- [ ] **Step 4: Run the checks to verify they pass**

```bash
cd web && node scripts/verify-print-payload.mjs
```

Expected: `ALL CHECKS PASSED`.

Note: `btoa` is a browser global. Node 18+ provides it, so the script runs as-is.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit
git add web/src/apps/shared/lib/escpos.ts web/scripts/verify-print-payload.mjs
git commit -m "feat(print): ESC/POS encoder, with non-ASCII replaced not sent"
```

---

### Task 2: Kitchen ticket formatter

**Files:**
- Create: `web/src/apps/shared/lib/kitchenTicket.ts`
- Modify: `web/scripts/verify-print-payload.mjs` (append checks before the summary)

**Interfaces:**
- Consumes: `Block` from `escpos.ts`; `ReceiptOrder`, `columnsFor`, `wrap`, `PaperWidth` from `receiptText.ts`.
- Produces: `export function kitchenTicketBlocks(order: ReceiptOrder, width: PaperWidth): Block[]`

- [ ] **Step 1: Write the failing checks**

In `web/scripts/verify-print-payload.mjs`, insert before the final `console.log(failures === 0 ...)`:

```js
const kot = await import(await loadTs('../src/apps/shared/lib/kitchenTicket.ts', 'kot.mjs', dir));
const receipt = await import(await loadTs('../src/apps/shared/lib/receiptText.ts', 'receipt.mjs', dir));

const order = {
  id: 41,
  name: 'Apurva Sharma',
  phone: '6393306919',
  needed_on: 'Today 8:15 PM',
  address_text: null,
  notes: 'Spicy, no onion',
  created_at: '2026-09-06T13:20:00',
  items: [
    { item_name: 'Kadai Paneer', qty: 1, price: 299, unit: 'plate' },
    { item_name: 'Tandoori Paneer Tikka Grilled Sandwich Platter', variant_name: 'Full',
      addons_text: 'Extra cheese', qty: 3, price: 249.5, unit: 'plate' },
  ],
  subtotal: 1047.5, discount_pct: 0, discount_amount: 0, cgst: 26.19, sgst: 26.19,
  gst_rate: 5, delivery_charge: 0, is_complimentary: false, total_estimate: 1100,
};

console.log('\nkitchenTicketBlocks');
const blocks = kot.kitchenTicketBlocks(order, 58);
const allText = blocks.map((b) => b.text).join('\n');

check('says it is the kitchen copy', /KITCHEN/i.test(allText));
check('carries the order number', allText.includes('#41'));
check('carries when it is needed', allText.includes('Today 8:15 PM'));
check('lists every item', allText.includes('Kadai Paneer') && allText.includes('Tandoori Paneer Tikka'));
check('shows quantities', /\b3\b/.test(allText) && /\b1\b/.test(allText));
check('carries the cooking note', allText.includes('Spicy, no onion'));

check('shows NO prices', !allText.includes('299') && !allText.includes('249.50'), allText);
check('shows NO tax lines', !/CGST|SGST/i.test(allText));
check('shows NO total', !/TOTAL/i.test(allText));

const cols = receipt.columnsFor(58);
const overWide = allText.split('\n').filter((l) => l.length > cols);
check('no line exceeds the paper width', overWide.length === 0,
  overWide.length ? `worst ${Math.max(...overWide.map((l) => l.length))} chars` : '');

check('items are double height', blocks.some((b) => b.size === 'double'));
check('the header is not double height', blocks[0].size !== 'double');
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd web && node scripts/verify-print-payload.mjs
```

Expected: FAIL — cannot resolve `kitchenTicket.ts`.

- [ ] **Step 3: Write the formatter**

Create `web/src/apps/shared/lib/kitchenTicket.ts`:

```ts
/**
 * The kitchen's copy of an order.
 *
 * It is not a bill and deliberately carries no money: prices, tax and totals
 * are noise to someone deciding what to cook, and every line of noise is a line
 * that pushes the food further down a 58mm slip. Items print at double height
 * so the ticket can be read at arm's length across a hot counter.
 */

import type { Block } from './escpos';
import { columnsFor, wrap, type PaperWidth, type ReceiptOrder } from './receiptText';

function ticketTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function kitchenTicketBlocks(order: ReceiptOrder, width: PaperWidth): Block[] {
  const cols = columnsFor(width);
  const header: string[] = [];

  header.push('*** KITCHEN COPY ***');
  header.push('='.repeat(cols));
  header.push(`Order #${order.id}`);
  const placed = ticketTime(order.created_at);
  if (placed) header.push(`Placed: ${placed}`);
  if (order.needed_on) header.push(...wrap(`NEEDED: ${order.needed_on}`, cols));
  header.push('-'.repeat(cols));

  /* Double height halves the characters that fit vertically, not horizontally,
     so the wrap width is unchanged — but the quantity leads the line, because
     that is the thing a cook reads first. */
  const items: string[] = [];
  for (const it of order.items) {
    let label = it.item_name;
    if (it.variant_name) label += ` (${it.variant_name})`;
    if (it.addons_text) label += ` + ${it.addons_text}`;
    const lines = wrap(`${it.qty} x ${label}`, cols);
    items.push(...lines);
  }

  const footer: string[] = [];
  if (order.notes) {
    footer.push('-'.repeat(cols));
    footer.push(...wrap(`NOTE: ${order.notes}`, cols));
  }

  const blocks: Block[] = [{ text: header.join('\n'), size: 'normal' }];
  blocks.push({ text: items.join('\n'), size: 'double' });
  if (footer.length) blocks.push({ text: footer.join('\n'), size: 'normal' });
  return blocks;
}
```

- [ ] **Step 4: Run the checks to verify they pass**

```bash
cd web && node scripts/verify-print-payload.mjs
```

Expected: `ALL CHECKS PASSED`.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit
git add web/src/apps/shared/lib/kitchenTicket.ts web/scripts/verify-print-payload.mjs
git commit -m "feat(print): kitchen ticket, items double height and no prices"
```

---

### Task 3: TypeScript bridge to the plugin

**Files:**
- Create: `web/src/apps/shared/print/thermalPrinter.ts`

**Interfaces:**
- Consumes: `isNativePlatform` from `web/src/apps/shared/push/nativePush.ts`; `encode`, `toBase64`, `Block` from `escpos.ts`.
- Produces:
  - `export interface PairedPrinter { name: string; address: string }`
  - `export function printerSupported(): boolean`
  - `export function listPairedPrinters(): Promise<PairedPrinter[]>`
  - `export function ensurePrinterPermission(): Promise<boolean>`
  - `export function printBlocks(address: string, blocks: Block[]): Promise<void>` — rejects with a human-readable `Error`

There is no verification script for this task: it is a thin bridge whose only logic is the platform guard, and the behaviour that matters is exercised on the device in Task 7. Read `web/src/apps/shared/push/dndAccess.ts` first — this file mirrors it.

- [ ] **Step 1: Write the bridge**

Create `web/src/apps/shared/print/thermalPrinter.ts`:

```ts
/**
 * Talks to ThermalPrinterPlugin.java.
 *
 * Mirrors shared/push/dndAccess.ts, including the important part: on the web
 * there is no plugin, and this module must degrade rather than throw. A desktop
 * admin opening the print page should see the ordinary print button, not an
 * error about Bluetooth.
 */

import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from '../push/nativePush';
import { encode, toBase64, type Block } from '../lib/escpos';

export interface PairedPrinter {
  name: string;
  address: string;
}

interface ThermalPrinterPlugin {
  listPaired(): Promise<{ devices: PairedPrinter[] }>;
  print(options: { address: string; dataBase64: string }): Promise<{ ok: boolean }>;
  ensurePermission(): Promise<{ granted: boolean }>;
}

const Native = registerPlugin<ThermalPrinterPlugin>('ThermalPrinter');

/** Bluetooth printing exists only inside the Android app. */
export function printerSupported(): boolean {
  return isNativePlatform();
}

export async function listPairedPrinters(): Promise<PairedPrinter[]> {
  if (!printerSupported()) return [];
  const { devices } = await Native.listPaired();
  return devices ?? [];
}

export async function ensurePrinterPermission(): Promise<boolean> {
  if (!printerSupported()) return false;
  const { granted } = await Native.ensurePermission();
  return !!granted;
}

/**
 * Encode and send. Rejects with a message fit to show a person at a counter —
 * the plugin's reasons are already written that way, and anything unexpected is
 * given a plain fallback rather than surfacing a Java exception.
 */
export async function printBlocks(address: string, blocks: Block[]): Promise<void> {
  if (!printerSupported()) {
    throw new Error('Printing over Bluetooth only works in the app.');
  }
  const dataBase64 = toBase64(encode(blocks));
  try {
    await Native.print({ address, dataBase64 });
  } catch (e) {
    const message = (e as { message?: string })?.message;
    throw new Error(message || 'Could not reach the printer. Check it is on and in range.');
  }
}
```

- [ ] **Step 2: Verify it compiles and the web path is inert**

```bash
cd web && npx tsc --noEmit
```

Expected: clean. `registerPlugin` never throws on the web; the guards mean no plugin call is made there.

- [ ] **Step 3: Commit**

```bash
git add web/src/apps/shared/print/thermalPrinter.ts
git commit -m "feat(print): typed bridge to the thermal printer plugin"
```

---

### Task 4: The native plugin

**Files:**
- Create: `web/android/app/src/main/java/com/vaatsalyakitchens/app/ThermalPrinterPlugin.java`
- Modify: `web/android/app/src/main/java/com/vaatsalyakitchens/app/MainActivity.java`
- Modify: `web/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: the method names and payload shape defined in Task 3 — `listPaired()`, `print({address, dataBase64})`, `ensurePermission()`.
- Produces: a plugin registered as `ThermalPrinter`.

- [ ] **Step 1: Add the Bluetooth permissions**

In `web/android/app/src/main/AndroidManifest.xml`, after the existing
`USE_FULL_SCREEN_INTENT` line, add:

```xml
    <!-- Printing to the counter's Bluetooth printer. Only BONDED devices are
         used — the printer is paired once in Android settings — so BLUETOOTH_SCAN
         is deliberately not requested: scanning is the permission that asks for
         nearby-devices access, and we never scan.
         BLUETOOTH_CONNECT is runtime from Android 12; the two legacy permissions
         cover older phones and are capped so they are not requested twice. -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
```

- [ ] **Step 2: Write the plugin**

Create `ThermalPrinterPlugin.java`:

```java
package com.vaatsalyakitchens.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.UUID;

/**
 * Prints to the counter's Bluetooth thermal printer.
 *
 * BLUETOOTH CLASSIC, NOT BLE, AND NOT BY PREFERENCE. The PT-210 reports itself
 * as a DUAL device but advertises exactly one service — the Serial Port Profile
 * UUID below. It exposes no GATT printing service, so RFCOMM is the only way in.
 *
 * The socket is opened per print and closed after. Holding one open is what goes
 * stale when the printer sleeps, and a receipt is small enough that reconnecting
 * costs nothing anyone can perceive.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        // Alias spelled literally: an annotation cannot reference a constant on
        // the class it annotates.
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class ThermalPrinterPlugin extends Plugin {

    private static final String BLUETOOTH = "bluetooth";
    private static final String TAG = "ThermalPrinter";

    /** Serial Port Profile. Every ESC/POS printer speaking Classic uses it. */
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /** Android 11 and below granted Bluetooth at install time. */
    private boolean needsRuntimePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private boolean hasPermission() {
        return !needsRuntimePermission() || getPermissionState(BLUETOOTH) == PermissionState.GRANTED;
    }

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (hasPermission()) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias(BLUETOOTH, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasPermission());
        call.resolve(res);
    }

    /**
     * Bonded devices that offer SPP.
     *
     * Filtered on the service rather than shown wholesale: a counter phone is
     * paired with headsets, a car and a TV, and a picker listing all of them
     * invites someone to choose the wrong one at the worst moment.
     */
    @PluginMethod
    public void listPaired(PluginCall call) {
        if (!hasPermission()) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is switched off.");
            return;
        }

        JSArray devices = new JSArray();
        try {
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                if (!offersSpp(device)) {
                    continue;
                }
                JSObject entry = new JSObject();
                entry.put("name", device.getName() != null ? device.getName() : device.getAddress());
                entry.put("address", device.getAddress());
                devices.put(entry);
            }
        } catch (SecurityException e) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }

        JSObject res = new JSObject();
        res.put("devices", devices);
        call.resolve(res);
    }

    private boolean offersSpp(BluetoothDevice device) {
        try {
            android.os.ParcelUuid[] uuids = device.getUuids();
            if (uuids == null) {
                // Some devices report no cached UUIDs; let them through rather
                // than hide a printer that would have worked.
                return true;
            }
            for (android.os.ParcelUuid uuid : uuids) {
                if (SPP.equals(uuid.getUuid())) {
                    return true;
                }
            }
            return false;
        } catch (SecurityException e) {
            return false;
        }
    }

    /**
     * Connect, write, close — on a background thread, because socket I/O on the
     * main thread freezes the counter's screen while the printer is reached.
     */
    @PluginMethod
    public void print(PluginCall call) {
        String address = call.getString("address");
        String dataBase64 = call.getString("dataBase64");
        if (address == null || address.isEmpty() || dataBase64 == null) {
            call.reject("No printer chosen.");
            return;
        }
        if (!hasPermission()) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }

        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth is switched off.");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                socket = device.createRfcommSocketToServiceRecord(SPP);

                // Discovery while connecting is slow and unreliable; we are not
                // scanning, but another part of the system might be.
                adapter.cancelDiscovery();

                socket.connect();
                byte[] payload = Base64.decode(dataBase64, Base64.DEFAULT);
                OutputStream out = socket.getOutputStream();
                out.write(payload);
                out.flush();

                JSObject res = new JSObject();
                res.put("ok", true);
                call.resolve(res);
            } catch (SecurityException e) {
                call.reject("Allow Bluetooth access to print.");
            } catch (IllegalArgumentException e) {
                call.reject("That printer address is not valid. Choose the printer again.");
            } catch (Exception e) {
                Log.w(TAG, "print failed", e);
                call.reject("Could not reach the printer. Check it is on and in range.");
            } finally {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Exception ignored) {
                        /* already gone */
                    }
                }
            }
        }).start();
    }
}
```

- [ ] **Step 3: Register the plugin**

In `MainActivity.java`, add one line beside the existing registration:

```java
        registerPlugin(DndAccessPlugin.class);
        registerPlugin(ThermalPrinterPlugin.class);
```

- [ ] **Step 4: Build and verify the permissions landed**

```bash
cd web && npx cap sync android
cd android && JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot" ./gradlew assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`. Then confirm the permission is compiled in and that scanning was **not** requested:

```bash
BT="$LOCALAPPDATA/Android/Sdk/build-tools/$(ls "$LOCALAPPDATA/Android/Sdk/build-tools" | tail -1)"
"$BT/aapt.exe" dump permissions app/build/outputs/apk/debug/app-debug.apk | grep -i bluetooth
```

Expected: `BLUETOOTH_CONNECT` present, `BLUETOOTH_SCAN` absent.

- [ ] **Step 5: Commit**

```bash
git add web/android/app/src/main/java/com/vaatsalyakitchens/app/ThermalPrinterPlugin.java \
        web/android/app/src/main/java/com/vaatsalyakitchens/app/MainActivity.java \
        web/android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): Bluetooth Classic RFCOMM printer plugin"
```

---

### Task 5: Printer settings, per device

**Files:**
- Create: `web/src/apps/admin/hooks/usePrinterSetting.ts`

**Interfaces:**
- Consumes: `PairedPrinter` from `thermalPrinter.ts`.
- Produces:
  - `export interface PrinterSetting { printer: PairedPrinter | null; autoPrint: boolean }`
  - `export function usePrinterSetting(): { printer, autoPrint, choosePrinter(p: PairedPrinter | null): void, setAutoPrint(on: boolean): void }`

Read `web/src/apps/admin/hooks/usePaperSetting.ts` first — this sits beside it and follows the same storage reasoning.

- [ ] **Step 1: Write the hook**

Create `web/src/apps/admin/hooks/usePrinterSetting.ts`:

```ts
import { useCallback, useState } from 'react';
import type { PairedPrinter } from '../../shared/print/thermalPrinter';

/**
 * Which printer this device prints to, and whether it prints without being
 * asked.
 *
 * Per device for the same reason as the paper width: a printer belongs to a
 * counter phone, not to the business. A manager's phone and a counter phone
 * must be able to disagree.
 */

const PRINTER_KEY = 'vk-printer';
const AUTO_KEY = 'vk-print-auto';

function readPrinter(): PairedPrinter | null {
  try {
    const raw = localStorage.getItem(PRINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairedPrinter;
    return parsed && parsed.address ? parsed : null;
  } catch {
    return null;
  }
}

function readAuto(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    // Never auto-print until a printer has been chosen: a device with none
    // configured would otherwise raise an error on every saved order.
    if (raw === null) return readPrinter() !== null;
    return raw === '1';
  } catch {
    return false;
  }
}

export function usePrinterSetting() {
  const [printer, setPrinter] = useState<PairedPrinter | null>(readPrinter);
  const [autoPrint, setAuto] = useState<boolean>(readAuto);

  const choosePrinter = useCallback((next: PairedPrinter | null) => {
    setPrinter(next);
    try {
      if (next) {
        localStorage.setItem(PRINTER_KEY, JSON.stringify(next));
        // Choosing a printer is the moment auto-print becomes safe, so switch
        // it on unless the user has already expressed a preference.
        if (localStorage.getItem(AUTO_KEY) === null) {
          localStorage.setItem(AUTO_KEY, '1');
          setAuto(true);
        }
      } else {
        localStorage.removeItem(PRINTER_KEY);
      }
    } catch {
      /* storage blocked — the choice still applies for this session */
    }
  }, []);

  const setAutoPrint = useCallback((on: boolean) => {
    setAuto(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* as above */
    }
  }, []);

  return { printer, autoPrint, choosePrinter, setAutoPrint };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/apps/admin/hooks/usePrinterSetting.ts
git commit -m "feat(admin): per-device printer choice and auto-print setting"
```

---

### Task 6: Wiring — picker, document choice, print and reprint

**Files:**
- Create: `web/src/apps/admin/components/PrinterBar.tsx`
- Modify: `web/src/apps/admin/pages/OrderPrint.tsx`
- Modify: `web/src/apps/admin/pages/NewOrder.tsx:400-425` (the `placed` success block)

**Interfaces:**
- Consumes: everything produced by Tasks 1–5.
- Produces: `export function PrinterBar({ order, business, width }: { order: ReceiptOrder; business: ReceiptBusiness; width: PaperWidth })`

- [ ] **Step 1: Write the printer bar**

Create `web/src/apps/admin/components/PrinterBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Printer, RefreshCw, Check } from 'lucide-react';
import {
  printerSupported,
  listPairedPrinters,
  ensurePrinterPermission,
  printBlocks,
  type PairedPrinter,
} from '../../shared/print/thermalPrinter';
import { receiptText, type PaperWidth, type ReceiptBusiness, type ReceiptOrder } from '../../shared/lib/receiptText';
import { kitchenTicketBlocks } from '../../shared/lib/kitchenTicket';
import type { Block } from '../../shared/lib/escpos';
import { usePrinterSetting } from '../hooks/usePrinterSetting';

export type PrintDocs = 'bill' | 'kot' | 'both';

/** Bill, kitchen ticket, or both — as blocks the encoder understands. */
export function documentsFor(
  which: PrintDocs,
  order: ReceiptOrder,
  business: ReceiptBusiness,
  width: PaperWidth
): { label: string; blocks: Block[] }[] {
  const bill = { label: 'Bill', blocks: [{ text: receiptText(order, business, width) }] as Block[] };
  const kot = { label: 'Kitchen ticket', blocks: kitchenTicketBlocks(order, width) };
  if (which === 'bill') return [bill];
  if (which === 'kot') return [kot];
  return [bill, kot];
}

export function PrinterBar({ order, business, width }: {
  order: ReceiptOrder;
  business: ReceiptBusiness;
  width: PaperWidth;
}) {
  const { printer, autoPrint, choosePrinter, setAutoPrint } = usePrinterSetting();
  const [devices, setDevices] = useState<PairedPrinter[]>([]);
  const [docs, setDocs] = useState<PrintDocs>('both');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const refresh = async () => {
    setNote(null);
    try {
      await ensurePrinterPermission();
      setDevices(await listPairedPrinters());
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  useEffect(() => {
    if (printerSupported()) void refresh();
  }, []);

  /** Prints each document in turn, reporting which one failed rather than a
   *  single failure for the pair — nobody should reprint a bill that printed. */
  const send = async () => {
    if (!printer) return;
    setBusy(true);
    setNote(null);
    setOk(false);
    for (const doc of documentsFor(docs, order, business, width)) {
      try {
        await printBlocks(printer.address, doc.blocks);
      } catch (e) {
        setNote(`${doc.label}: ${(e as Error).message}`);
        setBusy(false);
        return;
      }
    }
    setOk(true);
    setBusy(false);
    setTimeout(() => setOk(false), 2500);
  };

  if (!printerSupported()) return null;

  return (
    <div className="print:hidden mx-auto my-4 w-full max-w-md space-y-3 rounded-xl border border-cream-200 bg-white p-4 px-4">
      <div className="flex items-center justify-between gap-2">
        <select
          value={printer?.address ?? ''}
          onChange={(e) => choosePrinter(devices.find((d) => d.address === e.target.value) ?? null)}
          className="min-w-0 flex-1 rounded-lg border border-cream-300 px-2 py-1.5 text-sm"
        >
          <option value="">Choose a printer…</option>
          {devices.map((d) => (
            <option key={d.address} value={d.address}>{d.name}</option>
          ))}
        </select>
        <button type="button" onClick={refresh} aria-label="Look for printers"
          className="rounded-lg border border-cream-300 p-2 text-brand-600 hover:bg-cream-100">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select value={docs} onChange={(e) => setDocs(e.target.value as PrintDocs)}
          className="rounded-lg border border-cream-300 px-2 py-1.5 text-sm">
          <option value="both">Bill + kitchen ticket</option>
          <option value="bill">Bill only</option>
          <option value="kot">Kitchen ticket only</option>
        </select>
        <button type="button" onClick={send} disabled={!printer || busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-cream-50 disabled:opacity-60">
          {ok ? <Check className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
          {busy ? 'Printing…' : ok ? 'Printed' : 'Print'}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-brand-600">
        <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)}
          className="accent-brand-900" />
        Print automatically when an order is saved
      </label>

      {note && <p className="text-sm font-medium text-red-700">{note}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Show it on the print page**

In `OrderPrint.tsx`, import it and render it directly above the thermal preview
block (`{paper !== 'a4' && (`):

```tsx
import { PrinterBar } from '../components/PrinterBar';
```

```tsx
      {paper !== 'a4' && <PrinterBar order={order} business={business} width={paper} />}
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd web && npx tsc --noEmit
git add web/src/apps/admin/components/PrinterBar.tsx web/src/apps/admin/pages/OrderPrint.tsx
git commit -m "feat(admin): printer picker and print controls on the receipt page"
```

- [ ] **Step 4: Auto-print and reprint on the saved-order screen**

In `NewOrder.tsx`, inside the `placed` success block, add a print attempt on
mount and a Reprint button. Add these imports:

```tsx
import { useAdminAuth } from '../context/AdminAuthContext';
import { usePaperSetting } from '../hooks/usePaperSetting';
import { usePrinterSetting } from '../hooks/usePrinterSetting';
import { printBlocks, printerSupported } from '../../shared/print/thermalPrinter';
import { documentsFor } from '../components/PrinterBar';
import { adminOrdersApi } from '../api/endpoints';
```

Then, inside the component (not inside the `if (placed)` branch — hooks must not
be conditional):

```tsx
  const { settings: adminSettings } = useAdminAuth();
  const [paper] = usePaperSetting();
  const { printer, autoPrint } = usePrinterSetting();
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  /* The order is already saved before this runs. Printing can fail and the sale
     still stands — which is why the failure shows a Reprint rather than
     anything resembling an error about the order. */
  const printSaved = async () => {
    if (!placed || !printer || paper === 'a4' || !printerSupported()) return;
    setPrinting(true);
    setPrintNote(null);
    try {
      const full = (await adminOrdersApi.show(placed.id)).order;
      const header = adminSettings?.print_header;
      const business = {
        name: header?.kitchen_name || 'Vaatsalya Kitchens',
        address: header?.kitchen_address,
        phone: header?.kitchen_phone_display,
        email: header?.kitchen_email,
        gstin: header?.gstin,
        footer: header?.print_footer,
      };
      for (const doc of documentsFor('both', full, business, paper)) {
        await printBlocks(printer.address, doc.blocks);
      }
    } catch (e) {
      setPrintNote((e as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    if (placed && autoPrint) void printSaved();
    // Deliberately keyed on the order id alone: re-running on every render
    // would print the same order repeatedly.
  }, [placed?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

In the `placed` block's button row, beside `Print slip`:

```tsx
          {printerSupported() && printer && (
            <Button variant="outline" onClick={printSaved} disabled={printing}>
              <Printer className="h-4 w-4" /> {printing ? 'Printing…' : 'Reprint'}
            </Button>
          )}
```

And below `{claimNote && ...}`:

```tsx
        {printNote && (
          <p className="mt-3 text-sm font-medium text-red-700">
            {printNote} — the order is saved; tap Reprint once the printer is ready.
          </p>
        )}
```

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc --noEmit
git add web/src/apps/admin/pages/NewOrder.tsx
git commit -m "feat(admin): print the receipt when a counter order is saved"
```

---

### Task 7: Verify on the printer

**Files:** none — this task changes no code. It is the only proof that any of the above works.

**Interfaces:** consumes the finished app.

Requires: the Galaxy S10 Lite (`SM-G770F`) connected over USB with debugging on,
and `PT-210_1033` switched on with paper.

- [ ] **Step 1: Build, install, launch**

```bash
cd web && VITE_API_ORIGIN=https://vaatsalyakitchens.in npm run build:app && npx cap sync android
cd android && JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot" ./gradlew assembleDebug --console=plain
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 2: The picker finds the printer and nothing else**

Sign in to the admin on the phone, open any order's print page, choose **58 mm
thermal**. The picker must list `PT-210_1033`. It must **not** list paired
headsets, the car, or the TV.

If the list is empty, check the permission was granted:

```bash
adb shell dumpsys package com.vaatsalyakitchens.app | grep -i BLUETOOTH_CONNECT
```

- [ ] **Step 3: Print a bill**

Choose **Bill only**, tap Print. Compare against the on-screen preview:

- every line fits the paper with no wrapping onto a second line
- amounts line up in one column down the right edge
- the total matches the order
- no stray glyphs where the letterhead is (proves the ASCII replacement works)

- [ ] **Step 4: Print a kitchen ticket**

Choose **Kitchen ticket only**. Items must be visibly taller than the header,
carry quantities, and show **no prices, no GST and no total**.

- [ ] **Step 5: Fail on purpose**

Switch the printer **off**, then tap Print. Expected: a red line reading
"Could not reach the printer. Check it is on and in range." — and nothing that
suggests the order failed.

Then save a new counter order with auto-print on and the printer still off.
Expected: the order saves, the failure is reported, and **Reprint** appears.
Switch the printer on, tap Reprint, and the receipt comes out.

- [ ] **Step 6: Record the result**

Commit nothing if all passed. If anything failed, stop and report it rather than
patching around it — a printer that half-works at a counter is worse than one
that is known to be broken.

---

## Notes for whoever executes this

- **Tasks 1 and 2 are the substance.** They are pure functions with real checks
  and can be finished with no phone, no printer and no Android build.
- **Task 4 cannot be verified by a compiler.** `BUILD SUCCESSFUL` proves nothing
  about whether bytes reach a printer; only Task 7 does.
- **Do not add a BLE fallback**, a paper-out query, or a cut command. All three
  are listed as out of scope in the spec, and the printer has no cutter.
- If `listPaired` returns the printer but `print` always fails, the likely cause
  is a phone that has bonded with the printer but never completed pairing —
  re-pair in Android settings before changing any code.

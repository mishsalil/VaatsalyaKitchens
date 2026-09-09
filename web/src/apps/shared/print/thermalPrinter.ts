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

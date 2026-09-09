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

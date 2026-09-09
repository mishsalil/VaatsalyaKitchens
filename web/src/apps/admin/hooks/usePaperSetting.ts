import { useCallback, useState } from 'react';
import type { PaperWidth } from '../../shared/lib/receiptText';

/**
 * Which receipt this device prints.
 *
 * STORED PER DEVICE, NOT IN THE DATABASE. A printer belongs to a counter phone,
 * not to the business: one counter can have a 58mm Posiflow while another has
 * none at all and prints A4 from a laptop. Putting this in admin Settings would
 * make the two devices fight over one value. It moves into the database the day
 * a printer becomes a business-wide fact, and not before.
 */
export type PaperChoice = PaperWidth | 'a4';

const STORAGE_KEY = 'vk-receipt-paper';

export const PAPER_OPTIONS: { value: PaperChoice; label: string; hint: string }[] = [
  { value: 58, label: '58 mm thermal', hint: 'Posiflow PT-210 and most 2" pocket printers' },
  { value: 80, label: '80 mm thermal', hint: '3" counter-top printers' },
  { value: 'a4', label: 'A4 / Letter', hint: 'An ordinary office printer' },
];

function read(): PaperChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '58') return 58;
    if (raw === '80') return 80;
    if (raw === 'a4') return 'a4';
  } catch {
    /* private mode, or storage blocked — fall through to the default */
  }
  // 58mm is the printer actually at the counter, so it is what a fresh device
  // assumes; someone printing A4 is at a desk and can change it.
  return 58;
}

export function usePaperSetting(): [PaperChoice, (next: PaperChoice) => void] {
  const [paper, setPaper] = useState<PaperChoice>(read);

  const choose = useCallback((next: PaperChoice) => {
    setPaper(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* Not being able to remember the choice is not a reason to refuse it. */
    }
  }, []);

  return [paper, choose];
}

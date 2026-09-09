/**
 * Lays a receipt out as plain text in fixed-width columns.
 *
 * ONE FORMATTER, TWO DESTINATIONS. A thermal printer prints characters in a
 * fixed grid — 32 columns on 58mm paper, 48 on 80mm — so an ESC/POS receipt is
 * literally this text. The same string pasted into WhatsApp (inside a triple-
 * backtick block, which WhatsApp renders monospace) reproduces the printed bill
 * exactly. So this file has no React, no DOM and no Bluetooth in it: it is a
 * pure function from an order to a string, which is also what makes it
 * testable without a printer.
 *
 * AMOUNTS CARRY NO CURRENCY SYMBOL. The rupee sign is absent from the code
 * pages most 58mm printers ship with, and prints as garbage or nothing at all;
 * thousands separators also cost columns that 32 characters cannot spare. So
 * every figure is a bare 1234.50 and the total says INR once, in words the
 * printer can definitely render.
 */

/** Paper widths we support, in millimetres. */
export type PaperWidth = 58 | 80;

/** Characters per line. The number the whole layout is built from. */
export function columnsFor(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

/** The business details printed at the top. Structural on purpose — both the
 *  admin settings object and a plain literal satisfy it. */
export interface ReceiptBusiness {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  footer?: string | null;
}

export interface ReceiptLine {
  item_name: string;
  variant_name?: string | null;
  addons_text?: string | null;
  unit?: string | null;
  qty: number;
  price: number;
}

export interface ReceiptOrder {
  id: number;
  name: string;
  phone: string;
  needed_on: string;
  address_text?: string | null;
  notes?: string | null;
  created_at: string;
  items: ReceiptLine[];
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  cgst: number;
  sgst: number;
  gst_rate: number;
  delivery_charge: number;
  is_complimentary: boolean;
  total_estimate: number;
}

/** 1234.5 -> "1234.50". Two decimals always, so the column never jitters. */
function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Breaks text onto lines of at most `width`, splitting on spaces where it can
 *  and mid-word only when a single word is longer than the line. */
export function wrap(text: string, width: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';

  for (let word of words) {
    // A word too long for any line has to be cut, or it would overflow.
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** "Label................1234.00" — label left, value hard right. */
function pair(label: string, value: string, cols: number): string {
  const gap = cols - label.length - value.length;
  if (gap >= 1) {
    return label + ' '.repeat(gap) + value;
  }
  // Value wins when space runs out: an amount must never be truncated.
  const room = Math.max(0, cols - value.length - 1);
  return label.slice(0, room).padEnd(room) + ' ' + value;
}

function centre(text: string, cols: number): string {
  const t = text.length > cols ? text.slice(0, cols) : text;
  const left = Math.floor((cols - t.length) / 2);
  return ' '.repeat(left) + t;
}

function rule(cols: number, ch = '-'): string {
  return ch.repeat(cols);
}

/** The dish name as it reads on a bill: name (variant) + add-ons. */
function lineLabel(l: ReceiptLine): string {
  let s = l.item_name;
  if (l.variant_name) s += ` (${l.variant_name})`;
  if (l.addons_text) s += ` + ${l.addons_text}`;
  return s;
}

function formatPlaced(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The whole receipt, as lines of at most `columnsFor(width)` characters.
 *
 * Returned as an array so a caller can join it for the clipboard or feed it to
 * a printer a line at a time.
 */
export function receiptLines(
  order: ReceiptOrder,
  business: ReceiptBusiness,
  width: PaperWidth
): string[] {
  const cols = columnsFor(width);
  const out: string[] = [];

  // --- Who ---
  out.push(...wrap(business.name, cols).map((l) => centre(l, cols)));
  if (business.address) out.push(...wrap(business.address, cols).map((l) => centre(l, cols)));
  if (business.phone) out.push(centre(business.phone, cols));
  if (business.email) out.push(...wrap(business.email, cols).map((l) => centre(l, cols)));
  if (business.gstin) out.push(centre('GSTIN: ' + business.gstin, cols));
  if (business.fssai) out.push(centre('FSSAI: ' + business.fssai, cols));
  out.push(rule(cols, '='));

  // --- Which order ---
  out.push(pair('Bill #' + order.id, formatPlaced(order.created_at), cols));
  out.push(...wrap('Customer: ' + order.name, cols));
  if (order.phone) out.push('Phone: ' + order.phone);
  if (order.needed_on) out.push(...wrap('Needed: ' + order.needed_on, cols));
  if (order.address_text) {
    out.push(...wrap('Deliver to: ' + order.address_text, cols));
  } else {
    out.push('Pickup from the kitchen');
  }
  if (order.notes) out.push(...wrap('Notes: ' + order.notes, cols));
  out.push(rule(cols));

  /* --- Items ---
     Name on its own line with the amount hard right, then quantity and rate
     indented beneath it. One layout for both paper widths: at 32 columns there
     is no room for a four-column table, and a receipt that changes shape with
     the paper is a receipt with two sets of bugs. */
  const AMOUNT_COL = 10;
  for (const it of order.items) {
    const amount = money(it.price * it.qty);
    const nameLines = wrap(lineLabel(it), cols - AMOUNT_COL);
    nameLines.forEach((l, i) => {
      out.push(i === nameLines.length - 1 ? pair(l, amount, cols) : l);
    });
    const unit = it.unit ? ` ${it.unit}` : '';
    out.push('  ' + it.qty + unit + ' x ' + money(it.price));
  }
  out.push(rule(cols));

  // --- What it costs ---
  const showsBreakdown =
    order.gst_rate > 0 || order.discount_amount > 0 || order.delivery_charge > 0;
  if (showsBreakdown) {
    out.push(pair('Subtotal', money(order.subtotal), cols));
  }
  if (order.discount_amount > 0) {
    out.push(pair(`Discount (${order.discount_pct}%)`, '-' + money(order.discount_amount), cols));
  }
  if (!order.is_complimentary && order.gst_rate > 0) {
    out.push(pair(`CGST (${order.gst_rate / 2}%)`, money(order.cgst), cols));
    out.push(pair(`SGST (${order.gst_rate / 2}%)`, money(order.sgst), cols));
  }
  if (order.delivery_charge > 0) {
    out.push(pair('Delivery', money(order.delivery_charge), cols));
  }

  /* Round-off is whatever the stored total does not account for once every
     other billed line is subtracted — the same derivation the A4 receipt uses,
     so the two can never disagree about the bill. */
  const roundOff =
    Math.round(
      (order.total_estimate -
        (order.subtotal - order.discount_amount) -
        order.cgst -
        order.sgst -
        order.delivery_charge) *
        100
    ) / 100;
  if (roundOff !== 0 && !order.is_complimentary) {
    out.push(pair('Round off', (roundOff > 0 ? '+' : '') + money(roundOff), cols));
  }

  out.push(rule(cols, '='));
  out.push(
    order.is_complimentary
      ? pair('TOTAL', 'COMPLIMENTARY', cols)
      : pair('TOTAL (INR)', money(order.total_estimate), cols)
  );
  out.push(rule(cols, '='));

  if (order.is_complimentary) {
    out.push(centre('No payment due', cols));
  }
  if (business.footer) {
    out.push('');
    out.push(...wrap(business.footer, cols).map((l) => centre(l, cols)));
  }

  return out;
}

/** The receipt as one string. */
export function receiptText(
  order: ReceiptOrder,
  business: ReceiptBusiness,
  width: PaperWidth
): string {
  return receiptLines(order, business, width).join('\n');
}

/**
 * The receipt wrapped for WhatsApp.
 *
 * The backticks are not decoration: WhatsApp renders a fenced block in a
 * monospace font, and without one its proportional font collapses every column
 * so the amounts no longer line up under each other.
 */
export function receiptForWhatsApp(
  order: ReceiptOrder,
  business: ReceiptBusiness,
  width: PaperWidth
): string {
  return '```\n' + receiptText(order, business, width) + '\n```';
}

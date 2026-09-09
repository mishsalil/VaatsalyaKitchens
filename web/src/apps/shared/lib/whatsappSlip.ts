/**
 * The order slip as it is sent on WhatsApp today.
 *
 * WHY THIS IS NOT THE PRINTER FORMAT. receiptText.ts lays a bill out in rigid
 * 32- or 48-character columns because that is what a thermal printer prints.
 * WhatsApp renders a proportional font, so columns collapse there and the
 * amounts stop lining up; this format reads as sentences instead and needs no
 * monospace block. Two destinations, two shapes — sharing one formatter between
 * them would make both worse.
 *
 * The layout mirrors the slip the kitchen already sends from its other system,
 * so staff and customers see something they recognise.
 *
 * THREE THINGS THE OLD SLIP HAS THAT THIS DATABASE DOES NOT:
 *   - a per-day order number (ORD-20260906-001). We hold an integer id, so the
 *     number here is ORD-<date>-<id>: unique and sortable, but it does not
 *     restart at 001 each morning. A real daily counter needs a migration.
 *   - a payment method. There is no such column anywhere, so the line is left
 *     out rather than always claiming "Cash on Delivery" — a bill that states
 *     something untrue is worse than one that stays quiet.
 *   - a delivery time. The API returns needed_on, the free text the counter
 *     typed ("Tomorrow lunch"), not a clock time, so that is what is shown.
 */

import type { ReceiptBusiness, ReceiptOrder } from './receiptText';

/** "Rs 299" for whole rupees, "Rs 6.60" otherwise — matching the old slip. */
function rs(n: number): string {
  const v = Math.round(n * 100) / 100;
  return 'Rs ' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

/** ORD-20260906-041 — date for reading, id for uniqueness. */
export function slipOrderNumber(order: Pick<ReceiptOrder, 'id' | 'created_at'>): string {
  const d = new Date(order.created_at);
  const stamp = isNaN(d.getTime())
    ? 'UNDATED'
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ORD-${stamp}-${String(order.id).padStart(3, '0')}`;
}

/* "06 Sep 2026", spelled out rather than left to toLocaleDateString, which
   renders September as "Sept" under en-IN and would not match the slip the
   kitchen already sends. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function slipDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const DIVIDER = '━'.repeat(20);

export function whatsappSlip(order: ReceiptOrder, business: ReceiptBusiness): string {
  const name = (business.name || 'Vaatsalya Kitchens').toUpperCase();
  const out: string[] = [];

  out.push(`🍽️ ${name}`);
  out.push(DIVIDER);
  out.push('ORDER SLIP');
  out.push(DIVIDER);
  out.push('');

  out.push(`Order Number: ${slipOrderNumber(order)}`);
  out.push(`Date: ${slipDate(order.created_at)}`);
  out.push(`Customer Name: ${order.name}`);
  if (order.phone) out.push(`Customer Mobile: ${order.phone}`);
  out.push('');

  out.push('Items:');
  order.items.forEach((it, i) => {
    let label = it.item_name;
    if (it.variant_name) label += ` (${it.variant_name})`;
    if (it.addons_text) label += ` + ${it.addons_text}`;
    out.push(`${i + 1}. ${label} - Qty: ${it.qty} x ${rs(it.price)} = ${rs(it.price * it.qty)}`);
  });
  out.push('');

  if (order.notes) {
    out.push(`Comments: ${order.notes}`);
    out.push('');
  }

  out.push(`Subtotal: ${rs(order.subtotal)}`);
  if (order.discount_amount > 0) {
    out.push(`Percentage Discount: ${rs(order.discount_amount)} (${order.discount_pct}%)`);
  }
  if (!order.is_complimentary && order.gst_rate > 0) {
    out.push(`CGST (${order.gst_rate / 2}%): ${rs(order.cgst)}`);
    out.push(`SGST (${order.gst_rate / 2}%): ${rs(order.sgst)}`);
  }
  if (order.delivery_charge > 0) {
    out.push(`Delivery: ${rs(order.delivery_charge)}`);
  }

  /* The same derivation the A4 receipt and the printed bill use, so all three
     agree about the rounding rather than each computing its own. */
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
    out.push(`Round Off: ${rs(roundOff)}`);
  }

  out.push(
    order.is_complimentary
      ? 'Total Amount: COMPLIMENTARY (no payment due)'
      : `Total Amount: ${rs(order.total_estimate)}`
  );
  out.push('');

  if (order.address_text) {
    out.push(`Deliver to: ${order.address_text}`);
  } else {
    out.push('Pickup from the kitchen');
  }
  if (order.needed_on) out.push(`Delivery by: ${order.needed_on}`);
  out.push('');

  out.push(DIVIDER);
  out.push('Thank you for your order! 🙏');
  out.push(name);
  if (order.discount_pct > 0) {
    out.push(`${order.discount_pct}% DISCOUNT applied on menu`);
  }
  /* The printed footer from settings is deliberately NOT repeated here: this
     slip closes with its own thank-you, and appending both produced a receipt
     that thanked the customer twice. */

  return out.join('\n');
}

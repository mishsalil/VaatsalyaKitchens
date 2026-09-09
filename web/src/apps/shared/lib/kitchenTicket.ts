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

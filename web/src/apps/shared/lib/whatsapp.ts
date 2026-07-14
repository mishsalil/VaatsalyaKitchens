import type { Order } from '../types';
import { displayPhone, rupees } from './format';

/**
 * Build the wa.me deep link the kitchen expects — same friendly format the old
 * order-success.php built server-side, now assembled in the SPA using the
 * kitchen's WhatsApp number from /api/me settings.
 */
export function buildWaMeUrl(kitchenWhatsapp: string, order: Order): string {
  const lines: string[] = [
    `Namaste Vaatsalya Kitchens! I have placed order #${order.id} on the website:`,
    '',
  ];
  for (const it of order.items) {
    let label = it.item_name;
    if (it.variant_name) label += ` (${it.variant_name})`;
    if (it.addons_text) label += ` + ${it.addons_text}`;
    lines.push(`• ${label} — ${it.qty} (${it.unit})`);
  }
  lines.push('');
  if (order.gst_rate > 0) {
    const roundOff = Math.round((order.total_estimate - order.subtotal - order.cgst - order.sgst) * 100) / 100;
    lines.push(`Subtotal: ${rupees(order.subtotal)}`);
    lines.push(`CGST (${order.gst_rate / 2}%): ${rupees(order.cgst)}`);
    lines.push(`SGST (${order.gst_rate / 2}%): ${rupees(order.sgst)}`);
    if (roundOff > 0) lines.push(`Round off: +${rupees(roundOff)}`);
    lines.push(`Estimated total: ${rupees(order.total_estimate)}`);
  } else {
    lines.push(`Estimated total: ${rupees(order.total_estimate)}`);
  }
  lines.push('');
  lines.push(`Name: ${order.name}`);
  lines.push(`Phone: ${displayPhone(order.phone)}`);
  if (order.occasion) lines.push(`Occasion: ${order.occasion}`);
  lines.push(`Needed on: ${order.needed_on}`);
  lines.push(order.address_text ? `Delivery address: ${order.address_text}` : 'Pickup order');
  if (order.notes) lines.push(`Notes: ${order.notes}`);
  return `https://wa.me/${kitchenWhatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}
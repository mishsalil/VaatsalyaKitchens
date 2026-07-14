import type { OrderStatus } from '../types';

/** ₹1,234 (Indian grouping, no decimals). */
export function rupees(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

/** 919876543210 → "+91 96238 36382" style display. Handles 10 or 12 digit forms. */
export function displayPhone(digits: string): string {
  const d = (digits || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  return digits || '';
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New — awaiting confirmation',
  confirmed: 'Confirmed',
  preparing: 'Being prepared',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: 'bg-gold-100 text-gold-800 ring-gold-200',
  confirmed: 'bg-brand-100 text-brand-800 ring-brand-200',
  preparing: 'bg-gold-200 text-gold-900 ring-gold-300',
  out_for_delivery: 'bg-brand-200 text-brand-900 ring-brand-300',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-cream-200 text-brand-600 ring-cream-300',
};

export function statusStyle(status: OrderStatus): string {
  return STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700 ring-gray-200';
}

/** Is the order in a state where it can still change (so polling is useful)? */
export function isOrderActive(status: OrderStatus): boolean {
  return status === 'new' || status === 'confirmed' || status === 'preparing' || status === 'out_for_delivery';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Convert a datetime-local string ("2026-07-20T13:00") into the human-readable
 * "Sat 20 Jul, 1:00 PM" the admin and phone-confirmation flow expect. Keeps the
 * schema (free-text needed_on) unchanged.
 */
export function formatNeededOn(value: string): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const day = DAYS[d.getDay()];
  const date = d.getDate();
  const mon = MONTHS[d.getMonth()];
  let h = d.getHours();
  const min = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = min < 10 ? `0${min}` : String(min);
  return `${day} ${date} ${mon}, ${h}:${mm} ${ampm}`;
}

/** Strip a phone to digits and normalize to 91XXXXXXXXXX (returns null if invalid). */
export function normalizePhone(input: string): string | null {
  let d = (input || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}
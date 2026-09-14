import type { DiscountOffer } from '../types';

/** Mirrors DISCOUNT_CEILING_PCT in includes/discounts.php — the server is the authority. */
export const DISCOUNT_CEILING_PCT = 24;
/** Where the counter's meter turns amber. */
export const DISCOUNT_WARN_PCT = 18;

export type MeterTone = 'ok' | 'warn' | 'over';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function discountMeter(codePct: number, manualPct: number): { total: number; tone: MeterTone; text: string } {
  const total = round2(codePct + manualPct);
  const tone: MeterTone = total > DISCOUNT_CEILING_PCT ? 'over' : total > DISCOUNT_WARN_PCT ? 'warn' : 'ok';
  const text = tone === 'over'
    ? `Over the ${DISCOUNT_CEILING_PCT} % ceiling — reduce the manual discount or remove the code.`
    : `Total discount ${total} % of ${DISCOUNT_CEILING_PCT} % max`;
  return { total, tone, text };
}

export function codeAmount(subtotal: number, pct: number, maxAmount: number): number {
  return Math.min(round2((subtotal * pct) / 100), maxAmount);
}

export function offerText(o: DiscountOffer): string {
  const cap = `up to ₹${o.max_amount}`;
  if (o.first_order_only) return `${o.pct} % off your first order, ${cap}`;
  if (o.min_order > 0) return `${o.pct} % off orders above ₹${o.min_order}, ${cap}`;
  return `${o.pct} % off, ${cap}`;
}

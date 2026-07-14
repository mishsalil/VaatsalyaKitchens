/**
 * Tax-exclusive GST helper — mirrors includes/gst.php::compute_gst so the
 * client-side cart/checkout preview matches the snapshot stored on order create.
 *
 * Menu prices are pre-tax; the customer pays the grand total (subtotal + GST),
 * rounded UP to the next whole rupee. `roundOff` is the paise adjustment so the
 * bill reconciles: subtotal + cgst + sgst + roundOff === total. A 0 rate yields
 * no tax (used for legacy orders); the ceiling still applies to the subtotal.
 */
export interface GstBreakdown {
  subtotal: number;
  gst: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  total: number;
  rate: number;
}

export function computeGst(subtotal: number, rate: number | string | undefined): GstBreakdown {
  const r = Math.max(0, Number(rate ?? 0) || 0);
  const sub = round2(subtotal);
  const gst = round2((sub * r) / 100);
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  const exact = round2(sub + cgst + sgst);
  // ceil with a tiny epsilon so a float-drifted whole number doesn't roll up.
  const total = Math.ceil(exact - 1e-4);
  const roundOff = round2(total - exact);
  return { subtotal: sub, gst, cgst, sgst, roundOff, total, rate: r };
}

/** Round to 2 decimals (handles float drift like 12.5 vs 12.499999). */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
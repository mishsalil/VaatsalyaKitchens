import { rupees } from '../../shared/lib/format';

export interface BillItem {
  name: string;
  qty: number;
  unit: string;
  price: number;
}

/** Optional tax-exclusive GST breakdown shown above the "To pay" line. */
export interface BillGst {
  subtotal: number;
  cgst: number;
  sgst: number;
  /** Paise adjustment so the bill reconciles with the rounded-up total (0 when already whole). */
  roundOff: number;
  rate: number;
  /* Counter billing (migration_006) — always absent on customer checkout, but
     present when the customer views an order a rep entered at the till. */
  discountPct?: number;
  discountAmount?: number;
  deliveryCharge?: number;
  complimentary?: boolean;
}

/**
 * Swiggy-style "Bill details" card — a read-only itemized bill used on checkout
 * and order-success. Cart editing happens in the CartSheet, not here. When a GST
 * breakdown is supplied (tax-exclusive, rate > 0), the subtotal / CGST / SGST
 * rows are shown and "To pay" is the grand total; otherwise it falls back to a
 * single total (legacy orders / GST disabled).
 */
export function BillDetails({ items, total, gst }: { items: BillItem[]; total: number; gst?: BillGst | null }) {
  const comp = !!gst?.complimentary;
  const discount = gst?.discountAmount ?? 0;
  const delivery = gst?.deliveryCharge ?? 0;
  // The adjustment rows stand on their own: a counter order can carry a discount
  // or delivery charge with GST switched off entirely.
  const hasGst = !!gst && (gst.rate > 0 || discount > 0 || delivery > 0 || comp);
  return (
    <div className="card-soft p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Bill details</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-sm text-brand-800">
            <span className="flex-1">
              {it.name} <span className="text-brand-400">× {it.qty}</span>
              {it.unit ? <span className="ml-1 text-xs text-brand-400">({it.unit})</span> : null}
            </span>
            <span className="font-medium text-brand-900">{rupees(it.price * it.qty)}</span>
          </li>
        ))}
      </ul>

      {hasGst && (
        <div className="mt-4 space-y-1.5 border-t border-dashed border-cream-300 pt-3 text-sm text-brand-700">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="text-brand-900">{rupees(gst!.subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between">
              <span>Discount ({(gst!.discountPct ?? 0).toLocaleString('en-IN')}%)</span>
              <span className="text-brand-900">− {rupees(discount)}</span>
            </div>
          )}
          {!comp && gst!.rate > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span>CGST ({(gst!.rate / 2).toLocaleString('en-IN')}%)</span>
                <span className="text-brand-900">{rupees(gst!.cgst)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>SGST ({(gst!.rate / 2).toLocaleString('en-IN')}%)</span>
                <span className="text-brand-900">{rupees(gst!.sgst)}</span>
              </div>
            </>
          )}
          {delivery > 0 && (
            <div className="flex items-center justify-between">
              <span>Delivery</span>
              <span className="text-brand-900">{rupees(delivery)}</span>
            </div>
          )}
          {gst!.roundOff > 0 && !comp && (
            <div className="flex items-center justify-between">
              <span>Round off</span>
              <span className="text-brand-900">+{rupees(gst!.roundOff)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-dashed border-cream-300 pt-3">
        <span className="text-sm font-semibold text-brand-700">To pay</span>
        <span className="text-lg font-bold text-brand-900">{comp ? 'Complimentary' : rupees(total)}</span>
      </div>
      <p className="mt-2 text-xs text-brand-400">
        {comp
          ? 'This order is on us — nothing to pay.'
          : hasGst
            ? 'Prices are exclusive of GST; final total is confirmed by us on the phone.'
            : 'Final price is confirmed by us on the phone — delivery charges may apply.'}
      </p>
    </div>
  );
}
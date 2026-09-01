import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { adminOrdersApi } from '../api/endpoints';
import { useAdminAuth } from '../context/AdminAuthContext';
import { rupees, displayPhone } from '../../shared/lib/format';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { lineLabel } from '../../shared/types';
import type { AdminOrder } from '../types';

/** Printable A4 receipt at /admin/orders/:id/print. Rendered OUTSIDE AdminLayout
 *  so the sidebar doesn't print; the small toolbar is hidden via `print:hidden`. */
export function AdminOrderPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const orderId = Number(id);

  // The letterhead comes from /admin/me (already bootstrapped) rather than
  // /admin/settings, which is gated on the `settings` cap that staff lack.
  const { settings: adminSettings } = useAdminAuth();
  const settings = adminSettings?.print_header ?? null;
  const logoPath = settings?.logo_path ?? null;

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    adminOrdersApi
      .show(orderId)
      .then((o) => setOrder(o.order))
      .catch((e) => setError((e as Error).message));
  }, [orderId]);

  if (error) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-red-700">{error}</div>;
  }
  if (!order || !settings) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-brand-400">Loading receipt…</div>;
  }

  const placed = new Date(order.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Round-off is whatever the stored total doesn't account for once every other
  // billed line is subtracted (discount and delivery included, per migration_006).
  const roundOff =
    Math.round(
      (order.total_estimate -
        (order.subtotal - order.discount_amount) -
        order.cgst -
        order.sgst -
        order.delivery_charge) *
        100,
    ) / 100;

  return (
    <div className="min-h-dvh bg-cream-100 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-cream-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-cream-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <Link to="/admin/orders" className="text-sm font-semibold text-brand-600 hover:underline">All orders</Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-900 px-4 py-1.5 text-sm font-semibold text-cream-50 hover:bg-brand-800"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {/* A4 receipt */}
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-8 text-brand-900 shadow-card print:my-0 print:max-w-full print:p-0 print:shadow-none sm:p-12">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-brand-900 pb-4">
          <div className="flex items-center gap-3">
            {logoPath ? (
              <img src={logoPath} alt="" className="h-16 w-16 object-contain" />
            ) : (
              <img src="/favicon.svg" alt="" className="h-12 w-12" />
            )}
            <div>
              <h1 className="font-serif text-2xl font-bold text-brand-900">{settings.kitchen_name || 'Vaatsalya Kitchens'}</h1>
              {settings.kitchen_address && <p className="text-sm text-brand-600">{settings.kitchen_address}</p>}
              <p className="text-sm text-brand-600">
                {settings.kitchen_phone_display}
                {settings.kitchen_email && ` · ${settings.kitchen_email}`}
              </p>
              {settings.gstin && <p className="text-sm text-brand-600">GSTIN: {settings.gstin}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">Receipt</p>
            <p className="text-lg font-bold text-brand-900">#{order.id}</p>
            <div className="mt-1"><StatusBadge status={order.status} /></div>
          </div>
        </header>

        {/* Meta */}
        <section className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">Customer</p>
            <p className="font-semibold text-brand-900">{order.name}</p>
            <p className="text-brand-700">{displayPhone(order.phone)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">Placed</p>
            <p className="text-brand-800">{placed}</p>
            <p className="text-brand-700">Needed: {order.needed_on}</p>
          </div>
        </section>

        {/* Delivery */}
        <section className="border-y border-cream-200 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">{order.address_text ? 'Delivery address' : 'Pickup'}</p>
          {order.address_text ? (
            <p className="text-brand-800">{order.address_text}</p>
          ) : (
            <p className="text-brand-600">Customer will collect from the kitchen.</p>
          )}
          {order.notes && <p className="mt-1 text-brand-700"><span className="font-semibold">Notes:</span> {order.notes}</p>}
        </section>

        {/* Items */}
        <section className="py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-900 text-left text-xs uppercase tracking-wide text-brand-500">
                <th className="py-2">Item</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i} className="border-b border-cream-100">
                  <td className="py-2 text-brand-900">
                    {lineLabel(it.item_name, it.variant_name, it.addons_text)}
                    {it.unit ? <span className="ml-1 text-brand-400">({it.unit})</span> : null}
                  </td>
                  <td className="py-2 text-center text-brand-700">{it.qty}</td>
                  <td className="py-2 text-right text-brand-700">{rupees(it.price)}</td>
                  <td className="py-2 text-right font-semibold text-brand-900">{rupees(it.price * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end">
            <div className="w-full max-w-xs space-y-1">
              {(order.gst_rate > 0 || order.discount_amount > 0 || order.delivery_charge > 0) && (
                <div className="flex items-center justify-between text-sm text-brand-600">
                  <span>Subtotal</span>
                  <span>{rupees(order.subtotal)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex items-center justify-between text-sm text-brand-600">
                  <span>Discount ({order.discount_pct}%)</span>
                  <span>− {rupees(order.discount_amount)}</span>
                </div>
              )}
              {!order.is_complimentary && order.gst_rate > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-brand-600">
                    <span>CGST ({order.gst_rate / 2}%)</span>
                    <span>{rupees(order.cgst)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-brand-600">
                    <span>SGST ({order.gst_rate / 2}%)</span>
                    <span>{rupees(order.sgst)}</span>
                  </div>
                </>
              )}
              {order.delivery_charge > 0 && (
                <div className="flex items-center justify-between text-sm text-brand-600">
                  <span>Delivery</span>
                  <span>{rupees(order.delivery_charge)}</span>
                </div>
              )}
              {roundOff > 0 && !order.is_complimentary && (
                <div className="flex items-center justify-between text-sm text-brand-600">
                  <span>Round off</span>
                  <span>+{rupees(roundOff)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t-2 border-brand-900 pt-2 text-base font-bold text-brand-900">
                <span>Total</span>
                <span>{order.is_complimentary ? 'COMPLIMENTARY' : rupees(order.total_estimate)}</span>
              </div>
              {order.is_complimentary && (
                <p className="pt-1 text-right text-xs font-semibold uppercase tracking-wide text-gold-700">
                  No payment due
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        {settings.print_footer && (
          <footer className="border-t border-cream-200 pt-4 text-center text-sm text-brand-500">
            {settings.print_footer}
          </footer>
        )}
      </div>

      {/* Print page margins */}
      <style>{`@media print { @page { margin: 12mm; } body { background: #fff; } }`}</style>
    </div>
  );
}
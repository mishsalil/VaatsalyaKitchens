import { useEffect, useState, type ReactNode } from 'react';
import { Phone, MessageCircle, MapPin, Clock, Tag, StickyNote } from 'lucide-react';
import { Sheet } from '../../shared/components/ui/Sheet';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { Skeleton } from '../../shared/components/Skeleton';
import { useToast } from '../../shared/context/ToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminOrdersApi } from '../api/endpoints';
import { rupees, displayPhone } from '../../shared/lib/format';
import { lineLabel } from '../../shared/types';
import type { AdminOrder } from '../types';
import type { OrderStatus } from '../../shared/types';

const STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

type Props = {
  orderId: number | null;
  onClose: () => void;
  onChanged: () => void;
};

export function OrderDrawer({ orderId, onClose, onChanged }: Props) {
  const toast = useToast();
  const { admin } = useAdminAuth();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (orderId == null) {
      setOrder(null);
      return;
    }
    setLoading(true);
    setOrder(null);
    adminOrdersApi
      .show(orderId)
      .then((d) => setOrder(d.order))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const setStatus = async (status: OrderStatus) => {
    if (!order || busy) return;
    setBusy(true);
    try {
      const res = await adminOrdersApi.updateStatus(order.id, status);
      setOrder({ ...order, status });
      toast.success(
        `Order #${order.id} → ${status}` + (res.push_sent > 0 ? ` · notified ${res.push_sent} device(s)` : '')
      );
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = orderId != null;

  const footer = order ? (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-400">Set status</p>
      <div className="flex flex-wrap gap-2">
        {/* Riders can only mark Delivered — mirrors the server restriction. */}
        {(admin?.role === 'rider' ? (['delivered'] as OrderStatus[]) : STATUSES).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || s === order.status}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              s === order.status
                ? 'bg-brand-900 text-cream-50'
                : 'border border-cream-300 text-brand-700 hover:bg-cream-100'
            }`}
          >
            {s === order.status ? '✓ ' : ''}{labelOf(s)}
          </button>
        ))}
      </div>
    </div>
  ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={order ? `Order #${order.id}` : 'Order'} label="Order details" footer={footer}>
      {loading ? (
        <div className="space-y-3 p-1">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : order ? (
        <div className="space-y-4 p-1">
          {/* Status + placed */}
          <div className="flex items-center justify-between">
            <StatusBadge status={order.status} />
            <span className="text-xs text-brand-400">
              {new Date(order.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Customer */}
          <Section icon={<Phone className="h-4 w-4" />} title="Customer">
            <p className="font-semibold text-brand-900">{order.name}</p>
            <p className="text-sm text-brand-600">{displayPhone(order.phone)}</p>
            <div className="mt-2 flex gap-2">
              <a href={`tel:+${order.phone}`} className="rounded-full border border-cream-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100">Call</a>
              <a href={`https://wa.me/${order.phone}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </div>
          </Section>

          {/* Needed + occasion */}
          <Section icon={<Clock className="h-4 w-4" />} title="When">
            <p className="text-sm text-brand-800">{order.needed_on}</p>
            {order.occasion && <p className="text-xs text-brand-500">Occasion: {order.occasion}</p>}
          </Section>

          {/* Delivery */}
          <Section icon={<MapPin className="h-4 w-4" />} title={order.address_text ? 'Deliver to' : 'Pickup'}>
            {order.address_text ? (
              <>
                <p className="text-sm text-brand-800">{order.address_text}</p>
                {order.lat != null && order.lng != null && (
                  <a href={`https://www.google.com/maps?q=${order.lat},${order.lng}`} target="_blank" rel="noopener" className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">Open in Maps →</a>
                )}
              </>
            ) : (
              <p className="text-sm text-brand-500">Customer will pick up.</p>
            )}
          </Section>

          {order.notes && (
            <Section icon={<StickyNote className="h-4 w-4" />} title="Notes">
              <p className="text-sm text-brand-800">{order.notes}</p>
            </Section>
          )}

          {/* Items */}
          <Section icon={<Tag className="h-4 w-4" />} title={`Items (${order.items.length})`}>
            <ul className="divide-y divide-cream-200 rounded-xl border border-cream-200">
              {order.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-brand-800">
                    {lineLabel(it.item_name, it.variant_name, it.addons_text)} <span className="text-brand-400">× {it.qty}</span>
                    <span className="ml-1 text-xs text-brand-400">({it.unit})</span>
                  </span>
                  <span className="font-semibold text-brand-900">{rupees(it.price * it.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 px-1">
              {order.gst_rate > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm text-brand-600">
                    <span>Subtotal</span>
                    <span>{rupees(order.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-brand-600">
                    <span>CGST ({order.gst_rate / 2}%)</span>
                    <span>{rupees(order.cgst)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-brand-600">
                    <span>SGST ({order.gst_rate / 2}%)</span>
                    <span>{rupees(order.sgst)}</span>
                  </div>
                  {roundOffOf(order) > 0 && (
                    <div className="flex items-center justify-between text-sm text-brand-600">
                      <span>Round off</span>
                      <span>+{rupees(roundOffOf(order))}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between border-t border-cream-200 pt-1">
                <span className="text-sm font-semibold text-brand-700">To pay</span>
                <span className="text-lg font-bold text-brand-900">{rupees(order.total_estimate)}</span>
              </div>
            </div>
          </Section>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-brand-500">Could not load this order.</p>
      )}
    </Sheet>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="card-soft p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500">{icon} {title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function labelOf(s: OrderStatus): string {
  return { new: 'New', confirmed: 'Confirmed', preparing: 'Preparing', out_for_delivery: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' }[s];
}

/** Paise adjustment between the exact subtotal+tax and the rounded-up total_estimate. */
function roundOffOf(o: AdminOrder): number {
  return Math.round((o.total_estimate - o.subtotal - o.cgst - o.sgst) * 100) / 100;
}
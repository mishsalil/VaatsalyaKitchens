import { useState } from 'react';
import { ClipboardList, ChevronDown } from 'lucide-react';
import type { AdminOrderListItem } from '../types';
import type { OrderStatus } from '../../shared/types';
import { rupees } from '../../shared/lib/format';

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'out_for_delivery', label: 'On the way' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'cancelled', label: 'Cancelled' },
];

const COLUMN_TINT: Record<OrderStatus, string> = {
  new: 'bg-gold-100 text-gold-800',
  confirmed: 'bg-brand-100 text-brand-800',
  preparing: 'bg-gold-200 text-gold-900',
  out_for_delivery: 'bg-brand-200 text-brand-900',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-cream-200 text-brand-600',
};

const COLLAPSE_KEY = 'vk-admin-orders-collapsed';
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === 'string')) : new Set();
  } catch {
    return new Set();
  }
}
function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

type Props = {
  orders: AdminOrderListItem[];
  onSelect: (id: number) => void;
  selectedId?: number;
};

/** Swiggy-style orders board: one collapsible column per status, cards clickable. */
export function OrdersKanban({ orders, onSelect, selectedId }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggle = (status: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      saveCollapsed(next);
      return next;
    });

  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map((col) => {
        const colOrders = orders.filter((o) => o.status === col.status);
        const isCollapsed = collapsed.has(col.status);
        return (
          <div key={col.status} className="w-72 shrink-0">
            <button
              type="button"
              onClick={() => toggle(col.status)}
              className="sticky top-0 z-10 mb-2 flex w-full items-center justify-between rounded-xl bg-cream-50 px-3 py-2 text-left transition-colors hover:bg-cream-100"
              aria-expanded={!isCollapsed}
            >
              <span className="flex items-center gap-1.5">
                <ChevronDown className={`h-3.5 w-3.5 text-brand-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COLUMN_TINT[col.status]}`}>{col.label}</span>
              </span>
              <span className="text-xs font-semibold text-brand-400">{colOrders.length}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-2">
                {colOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-cream-300 px-3 py-6 text-center text-xs text-brand-300">
                    No orders
                  </div>
                ) : (
                  colOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onSelect(o.id)}
                      className={`w-full rounded-xl border bg-white p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                        selectedId === o.id ? 'border-brand-900 ring-2 ring-brand-200' : 'border-cream-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-brand-900">#{o.id}</span>
                        <span className="text-xs text-brand-400">{formatShortTime(o.created_at)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-brand-800">{o.name}</p>
                      <p className="truncate text-xs text-brand-400">{o.phone}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs text-brand-500">
                          <ClipboardList className="h-3.5 w-3.5" /> {o.item_count}
                        </span>
                        {o.is_complimentary ? (
                          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-800">
                            Comp
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-brand-900">{rupees(o.total_estimate)}</span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-[11px] text-brand-400">Needed: {o.needed_on}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
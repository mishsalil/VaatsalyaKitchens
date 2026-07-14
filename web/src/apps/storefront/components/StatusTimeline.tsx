import { Check } from 'lucide-react';
import type { OrderStatus } from '../../shared/types';

const FLOW: { key: OrderStatus; label: string; note: string }[] = [
  { key: 'new', label: 'Order received', note: 'We have your order.' },
  { key: 'confirmed', label: 'Confirmed', note: 'The kitchen has confirmed it.' },
  { key: 'preparing', label: 'Being prepared', note: 'Freshly cooking your food.' },
  { key: 'out_for_delivery', label: 'On the way', note: 'Out for delivery to you.' },
  { key: 'delivered', label: 'Delivered', note: 'Enjoy your meal!' },
];

/**
 * Swiggy-style vertical order tracker. Completed stages are checked, the
 * current stage pulses, and future stages are muted. A cancelled order renders
 * a single muted node.
 */
export function StatusTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-cream-100 p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-300 text-brand-600">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-brand-700">Order cancelled</p>
          <p className="text-xs text-brand-500">Call us if this was a surprise.</p>
        </div>
      </div>
    );
  }

  const current = FLOW.findIndex((s) => s.key === status);

  return (
    <ol className="relative space-y-5 pl-1">
      {FLOW.map((stage, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li key={stage.key} className="relative flex gap-4">
            {i < FLOW.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-[calc(100%+0.25rem)] w-0.5 ${
                  done ? 'bg-brand-700' : 'bg-cream-200'
                }`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-cream-50 transition-colors ${
                done
                  ? 'bg-brand-700'
                  : isCurrent
                    ? 'animate-pulse bg-gold-500 text-brand-950 ring-4 ring-gold-200'
                    : 'border-2 border-cream-300 bg-white text-brand-300'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
            </span>
            <div className="pt-1">
              <p
                className={`text-sm font-semibold ${
                  isCurrent ? 'text-brand-900' : done ? 'text-brand-700' : 'text-brand-400'
                }`}
              >
                {stage.label}
              </p>
              <p className="text-xs text-brand-500">{stage.note}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
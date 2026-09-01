import { Trash2 } from 'lucide-react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { lineLabel, linePrice } from '../../shared/types';

export function OrderSummary() {
  const { lines, total, setQty } = useCart();
  if (lines.length === 0) {
    return (
      <div className="card-soft p-6 text-center text-brand-500">
        Nothing selected yet — use the <strong className="font-semibold">+ Add</strong> buttons above to choose your dishes.
      </div>
    );
  }
  return (
    <div className="card-soft p-5">
      <h3 className="text-lg font-bold text-brand-900">Your order so far</h3>
      <ul className="mt-3 space-y-2">
        {lines.map((l) => {
          const unit = linePrice(l);
          return (
            <li key={l.key} className="flex items-center justify-between gap-2 text-brand-800">
              <span className="flex-1">
                {lineLabel(l.name, l.variant?.name, l.addons.map((a) => a.name).join(', ') || undefined)}{' '}
                <span className="text-brand-400">×{l.qty}</span>
                {l.unit ? <span className="ml-1 text-sm text-brand-400">({l.unit})</span> : null}
              </span>
              <span className="font-medium">{rupees(unit * l.qty)}</span>
              <button
                type="button"
                onClick={() => setQty(l.key, 0)}
                aria-label={`Remove ${l.name}`}
                className="text-brand-300 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-cream-200 pt-3">
        <span className="font-medium text-brand-700">Estimated total</span>
        <span className="text-2xl font-bold text-brand-900">{rupees(total)}</span>
      </div>
      <p className="mt-1 text-xs text-brand-400">Final price is confirmed by us on the phone — delivery charges may apply.</p>
    </div>
  );
}
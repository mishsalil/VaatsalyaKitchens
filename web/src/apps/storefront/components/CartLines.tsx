import { Trash2 } from 'lucide-react';
import { Stepper } from '../../shared/components/ui/Stepper';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { lineLabel, linePrice, variantsText } from '../../shared/types';

/**
 * The cart's lines — label, unit price, stepper, line total, remove — shared
 * by the CartSheet and the wide-screen CartPanel. Each line is one
 * configuration of an item (keyed by variant + add-ons); the label shows the
 * variant and chosen add-ons. `compact` uses the small stepper.
 */
export function CartLines({ compact }: { compact?: boolean }) {
  const { lines, setQty } = useCart();
  return (
    <ul className="divide-y divide-cream-200">
      {lines.map((l) => {
        const unit = linePrice(l);
        return (
          <li key={l.key} className="flex items-center gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-brand-900">
                {lineLabel(l.name, variantsText(l.variants), l.addons.map((a) => a.name).join(', ') || undefined)}
              </p>
              <p className="text-xs text-brand-500">{rupees(unit)} · {l.unit}</p>
            </div>
            <Stepper
              qty={l.qty}
              size={compact ? 'sm' : 'md'}
              onMinus={() => setQty(l.key, l.qty - 1)}
              onPlus={() => setQty(l.key, l.qty + 1)}
            />
            <span className="w-20 text-right text-sm font-semibold text-brand-900">
              {rupees(unit * l.qty)}
            </span>
            <button
              type="button"
              onClick={() => setQty(l.key, 0)}
              aria-label={`Remove ${l.name} from cart`}
              className="rounded-full p-1.5 text-brand-300 transition-colors hover:bg-cream-100 hover:text-brand-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

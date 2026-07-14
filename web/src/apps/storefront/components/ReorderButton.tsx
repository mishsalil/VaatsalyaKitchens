import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useCart } from '../../shared/context/CartContext';
import { useToast } from '../../shared/context/ToastContext';
import { menuApi } from '../../shared/api/endpoints';
import type { OrderListItem } from '../../shared/types';

/**
 * Hydrate the cart from a past order, then send the user to /order. Menu item
 * names are re-checked against the live menu so a discontinued dish is skipped
 * (with a toast). The variant and add-ons are best-effort restored by matching
 * the snapshotted names against the live item's variants/add-ons; if a name no
 * longer matches, the line is added with the item's default configuration.
 */
export function ReorderButton({ order }: { order: OrderListItem }) {
  const navigate = useNavigate();
  const { clear, add } = useCart();
  const toast = useToast();

  const reorder = async () => {
    try {
      const { items } = await menuApi.get();
      clear();
      let added = 0;
      let skipped = 0;
      for (const it of order.items) {
        const match = items.find((m) => m.name === it.item_name);
        if (!match) {
          skipped += it.qty;
          continue;
        }
        const variant = it.variant_name
          ? match.variants.find((v) => v.name === it.variant_name) ?? null
          : undefined;
        const addonNames = it.addons_text ? it.addons_text.split(',').map((s) => s.trim()) : [];
        const addons = match.addons.filter((a) => addonNames.includes(a.name)).map((a) => ({ id: a.id, name: a.name, price: a.price }));
        for (let i = 0; i < it.qty; i++) {
          add({
            id: match.id,
            name: match.name,
            unit: match.unit,
            basePrice: match.price,
            variant: variant ? { id: variant.id, name: variant.name, priceDelta: variant.price_delta } : undefined,
            addons,
            qty: 1,
          });
        }
        added += it.qty;
      }
      if (added === 0) {
        toast.error("We couldn't add those dishes — they may no longer be on the menu.");
        return;
      }
      if (skipped > 0) toast.info(`${skipped} item(s) from that order are no longer on the menu and were skipped.`);
      navigate('/order');
    } catch {
      toast.error('Could not load the menu to reorder. Please try again.');
    }
  };

  return (
    <button
      type="button"
      onClick={reorder}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
    >
      <RotateCcw className="h-4 w-4" /> Reorder
    </button>
  );
}
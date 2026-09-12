import { useMemo, useState } from 'react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { suggestUpsells } from '../../shared/lib/upsell';
import { DishImage } from '../../shared/components/ui/DishImage';
import type { MenuCategory, MenuItem } from '../../shared/types';
import { ItemPickerModal } from './ItemPickerModal';

/** "Goes well with" — up to four one-tap additions chosen from the menu. */
export function UpsellStrip({ items, categories, closedCategoryIds }: {
  items: MenuItem[]; categories: MenuCategory[]; closedCategoryIds: number[];
}) {
  const { lines, add } = useCart();
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const cartItemIds = lines.map((l) => l.id);
  const picks = useMemo(() => suggestUpsells({ items, categories, cartItemIds, closedCategoryIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, categories, cartItemIds.join(','), closedCategoryIds.join(',')]);
  if (picks.length === 0) return null;
  const onAdd = (it: MenuItem) => {
    if (it.variants.length || it.addons.length) setPicking(it);
    else add({ id: it.id, name: it.name, unit: it.unit, basePrice: it.price, qty: 1 });
  };
  return (
    <section className="card-soft p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Goes well with</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {picks.map((it) => (
          <li key={it.id} className="flex flex-col rounded-2xl border border-cream-200 p-2">
            <DishImage item={it} className="aspect-[4/3] w-full" rounded="rounded-xl" />
            <p className="mt-2 line-clamp-1 text-sm font-medium text-brand-900">{it.name}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-brand-500">{it.variants.length ? 'from ' : ''}{rupees(it.price)}</span>
              <button type="button" onClick={() => onAdd(it)} className="rounded-full border border-brand-900 px-3 py-0.5 text-xs font-semibold text-brand-900 hover:bg-brand-900 hover:text-cream-50">+ Add</button>
            </div>
          </li>
        ))}
      </ul>
      {picking && <ItemPickerModal item={picking} open onClose={() => setPicking(null)} />}
    </section>
  );
}

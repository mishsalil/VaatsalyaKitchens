import { useState } from 'react';
import type { MenuItem } from '../../shared/types';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { DishImage } from '../../shared/components/ui/DishImage';
import { Stepper } from '../../shared/components/ui/Stepper';
import { ItemPickerModal } from './ItemPickerModal';

/**
 * Zomato-style menu-item card: left text block (name, unit, price, a gold
 * feature accent) + right dish photo + ADD→stepper control. The photo sits on
 * the right with the ADD/stepper floating over its bottom-left corner.
 *
 * Items with variants and/or add-ons open an ItemPickerModal on Add (and on
 * the stepper +) so each cart line is one explicit configuration. Items with
 * neither add directly, as before.
 */
export function MenuItemRow({ item }: { item: MenuItem }) {
  const { qtyOfItem, add, setQty, lastLineOfItem } = useCart();
  const qty = qtyOfItem(item.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasOptions = item.variants.length > 0 || item.addons.length > 0;
  const from = item.price;
  const priceLabel = hasOptions ? `from ${rupees(from)}` : rupees(from);

  const onAdd = () => {
    if (hasOptions) {
      setPickerOpen(true);
    } else {
      add({ id: item.id, name: item.name, unit: item.unit, basePrice: item.price, qty: 1 });
    }
  };

  const onMinus = () => {
    const last = lastLineOfItem(item.id);
    if (last) setQty(last.key, last.qty - 1);
  };

  return (
    <>
      <div className="flex gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand-900">{item.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-brand-500">
            <span className="font-medium text-gold-600">★</span>
            <span>{priceLabel}</span>
            <span className="text-brand-300">·</span>
            <span>{item.unit}</span>
          </p>
          {hasOptions ? (
            <p className="mt-1 text-xs font-medium text-brand-600">
              {item.variants.length > 0 && `${item.variants.length} size${item.variants.length > 1 ? 's' : ''}`}
              {item.variants.length > 0 && item.addons.length > 0 ? ' · ' : ''}
              {item.addons.length > 0 && `${item.addons.length} add-on${item.addons.length > 1 ? 's' : ''} available`}
            </p>
          ) : (
            <p className="mt-1 text-xs text-brand-400">Homestyle · made fresh on order</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <DishImage item={item} className="h-24 w-24" rounded="rounded-2xl" />
          {qty === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add ${item.name} to cart`}
              className="inline-flex items-center rounded-full border border-brand-900 bg-white px-4 py-1 text-sm font-semibold text-brand-900 shadow-card transition-all hover:bg-brand-900 hover:text-cream-50 active:scale-95"
            >
              Add
            </button>
          ) : (
            <Stepper
              qty={qty}
              onMinus={onMinus}
              onPlus={onAdd}
            />
          )}
        </div>
      </div>
      {hasOptions && <ItemPickerModal item={item} open={pickerOpen} onClose={() => setPickerOpen(false)} />}
    </>
  );
}
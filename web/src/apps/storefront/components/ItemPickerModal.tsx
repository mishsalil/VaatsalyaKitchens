import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import type { MenuItem } from '../../shared/types';

/**
 * Configure-and-add modal for items that have variants (pick one — radio) and/or
 * add-ons (tick any — checkboxes). Items with neither never open this modal.
 * The charged unit price = base + chosen variant delta + sum of chosen add-on
 * prices; the server re-reads all of these authoritatively on order create.
 */
export function ItemPickerModal({ item, open, onClose }: { item: MenuItem; open: boolean; onClose: () => void }) {
  const { add } = useCart();
  const hasVariants = item.variants.length > 0;
  const hasAddons = item.addons.length > 0;

  const defaultVariantId = useMemo(() => {
    const def = item.variants.find((v) => v.is_default);
    return def ? def.id : (item.variants[0]?.id ?? 0);
  }, [item.variants]);

  const [variantId, setVariantId] = useState<number>(defaultVariantId);
  const [addonIds, setAddonIds] = useState<number[]>([]);

  // Reset selections whenever a different item is opened.
  useEffect(() => {
    if (open) {
      setVariantId(defaultVariantId);
      setAddonIds([]);
    }
  }, [open, item.id, defaultVariantId]);

  const chosenVariant = item.variants.find((v) => v.id === variantId) ?? null;
  const chosenAddons = item.addons.filter((a) => addonIds.includes(a.id));
  const unitPrice =
    item.price +
    (chosenVariant?.price_delta ?? 0) +
    chosenAddons.reduce((s, a) => s + a.price, 0);

  const toggleAddon = (id: number) => {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirm = () => {
    add({
      id: item.id,
      name: item.name,
      unit: item.unit,
      basePrice: item.price,
      variant: chosenVariant ? { id: chosenVariant.id, name: chosenVariant.name, priceDelta: chosenVariant.price_delta } : undefined,
      addons: chosenAddons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      qty: 1,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-baseline justify-between gap-2">
          <span>{item.name}</span>
          <span className="text-sm font-normal text-brand-500">from {rupees(item.price)}</span>
        </span>
      }
      footer={
        <Button onClick={confirm} fullWidth>
          Add · {rupees(unitPrice)}
        </Button>
      }
    >
      <div className="space-y-5">
        {hasVariants && (
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-brand-500">Choose size</legend>
            <div className="mt-2 space-y-1.5">
              {item.variants.map((v) => {
                const checked = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      checked ? 'border-brand-900 bg-brand-50' : 'border-cream-200 bg-white hover:border-brand-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          checked ? 'border-brand-900' : 'border-brand-300'
                        }`}
                      >
                        {checked && <span className="h-2 w-2 rounded-full bg-brand-900" />}
                      </span>
                      <span className="text-sm font-medium text-brand-900">{v.name}</span>
                    </span>
                    <span className="text-sm font-semibold text-brand-700">
                      {v.price_delta >= 0 ? '+' : ''}
                      {rupees(item.price + v.price_delta)}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {hasAddons && (
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-brand-500">Add extras (optional)</legend>
            <div className="mt-2 space-y-1.5">
              {item.addons.map((a) => {
                const checked = addonIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddon(a.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      checked ? 'border-brand-900 bg-brand-50' : 'border-cream-200 bg-white hover:border-brand-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-md border-2 ${
                          checked ? 'border-brand-900 bg-brand-900 text-cream-50' : 'border-brand-300'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="text-sm font-medium text-brand-900">{a.name}</span>
                    </span>
                    <span className="text-sm font-semibold text-brand-700">+{rupees(a.price)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
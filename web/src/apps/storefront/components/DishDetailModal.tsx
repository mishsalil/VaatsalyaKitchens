import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { dishPhotos } from '../../shared/lib/dish';
import type { MenuItem } from '../../shared/types';
import { ItemPickerModal } from './ItemPickerModal';

/**
 * The whole dish on a small screen: its photos, the full description and the
 * same Add control as the row. Opened from "…See more"; on wide screens the row
 * already shows everything, so it is never offered there.
 */
export function DishDetailModal({ item, open, onClose, unavailableUntil }: {
  item: MenuItem; open: boolean; onClose: () => void; unavailableUntil?: string | null;
}) {
  const { add } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const photos = dishPhotos(item);
  const hasOptions = item.variants.length > 0 || item.addons.length > 0;

  const onAdd = () => {
    if (hasOptions) { setPickerOpen(true); return; }
    add({ id: item.id, name: item.name, unit: item.unit, basePrice: item.price, qty: 1 });
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={item.name}
        footer={unavailableUntil
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-800"><Clock className="h-3 w-3" /> Available {unavailableUntil}</span>
          : <Button onClick={onAdd} fullWidth>{hasOptions ? 'Choose options' : `Add · ${rupees(item.price)}`}</Button>}>
        {photos.length > 0 && (
          <div>
            <div className="-mx-5 flex snap-x snap-mandatory overflow-x-auto"
                 onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
              {photos.map((src, i) => (
                <img key={src} src={src} alt={i === 0 ? item.name : ''} loading={i === 0 ? 'eager' : 'lazy'}
                     className="aspect-[4/3] w-full shrink-0 snap-center object-cover" />
              ))}
            </div>
            {photos.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
                {photos.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === slide ? 'bg-brand-900' : 'bg-cream-300'}`} />)}
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-sm text-brand-500">{hasOptions ? `from ${rupees(item.price)}` : rupees(item.price)}{item.unit ? ` · ${item.unit}` : ''}</p>
        {item.description && <p className="mt-2 whitespace-pre-line text-sm text-brand-800">{item.description}</p>}
      </Modal>
      {hasOptions && <ItemPickerModal item={item} open={pickerOpen} onClose={() => { setPickerOpen(false); onClose(); }} />}
    </>
  );
}

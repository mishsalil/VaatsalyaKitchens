import { useState } from 'react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { CartSheet } from './CartSheet';

/**
 * Sticky bottom cart bar (Swiggy signature) — appears once items are in the
 * cart. Tapping it opens the CartSheet (bottom-sheet on mobile, right drawer
 * on desktop), whose "To checkout →" advances to /checkout.
 */
export function CartBar() {
  const { count, total } = useCart();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <>
      {/* Sit above the mobile bottom nav (bottom-14); lifted a touch on desktop. */}
      <div className="fixed inset-x-0 bottom-14 z-40 px-4 pb-2 sm:bottom-4 sm:px-6">
        <div className="container-wide">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-900 px-5 py-3.5 text-cream-50 shadow-bar transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cream-50/20 px-1.5 text-xs">
                {count}
              </span>
              View cart
            </span>
            <span className="flex items-center gap-2">
              <span className="font-bold">{rupees(total)}</span>
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </div>
      </div>
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
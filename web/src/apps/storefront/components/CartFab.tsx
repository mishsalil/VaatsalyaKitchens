import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '../../shared/context/CartContext';
import { rupees } from '../../shared/lib/format';
import { CartSheet } from './CartSheet';

/**
 * The cart as a floating button: bottom-right, above the tab bar, count on
 * its shoulder and the total in a pill beneath. Opens the CartSheet. Hidden
 * on checkout (the cart is on the page) and at lg+ on /order, where the open
 * CartPanel takes its place.
 */
export function CartFab() {
  const { count, total } = useCart();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (count === 0 || pathname === '/checkout') return null;
  const hideWide = pathname === '/order' ? 'lg:hidden' : '';
  return (
    <>
      {!open && (
        <div className={`fixed bottom-20 right-4 z-40 flex flex-col items-center gap-1 sm:bottom-6 ${hideWide}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open cart, ${count} items`}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-900 text-cream-50 shadow-lift transition-transform active:scale-95"
          >
            <ShoppingBag className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-400 px-1.5 text-xs font-bold text-brand-900">
              {count}
            </span>
          </button>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-900 shadow-card">
            {rupees(total)}
          </span>
        </div>
      )}
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

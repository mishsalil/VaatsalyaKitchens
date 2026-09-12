import { useNavigate } from 'react-router-dom';
import { useCart } from '../../shared/context/CartContext';
import { useAuth } from '../../shared/hooks/useAuth';
import { rupees } from '../../shared/lib/format';
import { computeGst } from '../../shared/lib/gst';
import { CartLines } from './CartLines';

/** The always-open cart in /order's third column on wide screens. */
export function CartPanel() {
  const { lines, total, count } = useCart();
  const { settings } = useAuth();
  const navigate = useNavigate();
  const gst = computeGst(total, settings?.gst_rate);
  return (
    <aside className="sticky top-24 hidden self-start lg:block">
      <div className="card-soft p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Your cart</h2>
          {count > 0 && (
            <span className="text-xs text-brand-400">{count} {count === 1 ? 'item' : 'items'}</span>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-brand-500">Your cart is empty — add dishes from the menu.</p>
        ) : (
          <>
            <div className="mt-2 max-h-[50vh] overflow-y-auto">
              <CartLines compact />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-cream-200 pt-3">
              <span className="text-sm font-semibold text-brand-700">Subtotal</span>
              <span className="text-lg font-bold text-brand-900">{rupees(total)}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-brand-900 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-brand-800"
            >
              Checkout · {rupees(gst.total)}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

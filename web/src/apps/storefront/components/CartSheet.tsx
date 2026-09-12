import { useNavigate } from 'react-router-dom';
import { Sheet } from '../../shared/components/ui/Sheet';
import { useCart } from '../../shared/context/CartContext';
import { useAuth } from '../../shared/hooks/useAuth';
import { rupees } from '../../shared/lib/format';
import { computeGst } from '../../shared/lib/gst';
import { CartLines } from './CartLines';

/**
 * The cart contents as a bottom-sheet (mobile) / right-drawer (desktop).
 * Per-line steppers, a remove control, the subtotal, and a "To checkout →"
 * button that closes the sheet and heads to /checkout (the focused step 2).
 * Menu prices are tax-exclusive; the button shows the grand total incl. GST.
 * Each line is one configuration of an item (keyed by variant + add-ons); the
 * label shows the variant and chosen add-ons.
 */
export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, total, count } = useCart();
  const { settings } = useAuth();
  const navigate = useNavigate();
  const gst = computeGst(total, settings?.gst_rate);

  const goCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  const hasGst = gst.rate > 0;

  const footer =
    lines.length > 0 ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-brand-700">Subtotal</span>
          <span className="text-lg font-bold text-brand-900">{rupees(total)}</span>
        </div>
        {hasGst && (
          <div className="flex items-center justify-between text-xs text-brand-500">
            <span>+ {gst.rate}% GST (CGST + SGST)</span>
            <span>{rupees(gst.gst)}</span>
          </div>
        )}
        {hasGst && gst.roundOff > 0 && (
          <div className="flex items-center justify-between text-xs text-brand-500">
            <span>Round off</span>
            <span>+{rupees(gst.roundOff)}</span>
          </div>
        )}
        <button
          type="button"
          onClick={goCheckout}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-900 px-5 py-3.5 text-sm font-semibold text-cream-50 shadow-card transition-all hover:bg-brand-800 hover:shadow-lift active:scale-[0.99]"
        >
          To checkout · {rupees(gst.total)}
        </button>
      </div>
    ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your cart"
      label={`${count} ${count === 1 ? 'item' : 'items'}`}
      footer={footer}
    >
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-brand-900">Your cart is empty</p>
          <p className="text-sm text-brand-500">Add a dish from the menu to get started.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-full bg-brand-900 px-5 py-2 text-sm font-semibold text-cream-50 transition-colors hover:bg-brand-800"
          >
            Browse menu
          </button>
        </div>
      ) : (
        <CartLines compact />
      )}
    </Sheet>
  );
}
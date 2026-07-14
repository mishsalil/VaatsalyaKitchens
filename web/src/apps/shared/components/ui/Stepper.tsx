import { Minus, Plus } from 'lucide-react';

type Props = {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  /** size sm = compact (cart sheet rows), md = default (menu cards). */
  size?: 'sm' | 'md';
};

/**
 * Pill-shaped quantity stepper (Swiggy-style). The minus/plus sit inside a
 * white pill with a brand border; the plus is filled maroon.
 */
export function Stepper({ qty, onMinus, onPlus, size = 'md' }: Props) {
  const btn = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-1 rounded-full border border-brand-900 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={onMinus}
        aria-label="Remove one"
        className={`flex ${btn} items-center justify-center rounded-full text-brand-700 transition-colors hover:bg-cream-100 active:scale-95`}
      >
        <Minus className={icon} />
      </button>
      <span className="min-w-5 text-center text-sm font-bold text-brand-900" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Add one"
        className={`flex ${btn} items-center justify-center rounded-full bg-brand-900 text-cream-50 transition-colors hover:bg-brand-800 active:scale-95`}
      >
        <Plus className={icon} />
      </button>
    </div>
  );
}
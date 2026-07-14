import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** ARIA label for the close button / sheet. */
  label?: string;
};

/**
 * A bottom-sheet (mobile) / right-side drawer (desktop) with backdrop, scroll
 * lock, and entrance animation. Used for the cart and any other overlay panel.
 */
export function Sheet({ open, onClose, title, children, footer, label = 'Panel' }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm sm:bg-brand-950/30"
      />
      {/* Panel: bottom sheet on mobile, right drawer on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative z-10 flex max-h-[88vh] w-full flex-col bg-white shadow-sheet animate-slide-up sm:max-h-full sm:w-full sm:max-w-md sm:animate-slide-in-right"
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
            <h3 className="text-base font-semibold text-brand-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-brand-400 transition-colors hover:bg-cream-100 hover:text-brand-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-cream-200 bg-white px-5 py-4 pb-safe">{footer}</div>
        )}
      </div>
    </div>
  );
}
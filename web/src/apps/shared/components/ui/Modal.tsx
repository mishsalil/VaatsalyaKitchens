import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={onClose} />
      {/* Capped at the viewport with the body scrolling inside it: the item form
          is now tall enough (three photo slots) to run off both ends of a phone,
          which took the Save button with it. dvh, not vh, so the browser's own
          chrome does not push the footer out of reach. Short modals are
          unaffected — this is a maximum, not a height. */}
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md animate-slide-up flex-col rounded-t-2xl border border-cream-200 bg-white shadow-card sm:max-h-[85dvh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
          <h3 className="text-base font-semibold text-brand-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-brand-400 transition-colors hover:bg-cream-100 hover:text-brand-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 text-sm text-brand-800 ${footer ? "" : "pb-5"}`}>{children}</div>
        {footer ? <div className="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

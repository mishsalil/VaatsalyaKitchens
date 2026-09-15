import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** The per-field alert block; also used by cards whose error isn't tied to one input. */
export function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700" role="alert">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-brand-800">
        {label}
        {hint ? <span className="ml-1 font-normal text-brand-400">{hint}</span> : null}
      </label>
      {children}
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}
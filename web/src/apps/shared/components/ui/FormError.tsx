import { AlertCircle } from 'lucide-react';

/**
 * Form-level / server-error banner — a visible red alert placed at the TOP of a
 * form (above the fields). Use for errors that aren't tied to a single input
 * (e.g. "Could not sign in", network failures). Per-field validation errors
 * belong on the `Field` + `invalid` input instead.
 */
export function FormError({ message, id }: { message: string; id?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
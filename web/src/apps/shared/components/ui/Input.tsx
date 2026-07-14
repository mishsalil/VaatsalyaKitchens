import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

const base =
  'w-full rounded-xl border bg-white px-4 py-2.5 text-brand-950 placeholder:text-brand-300 transition-colors focus:outline-none focus:ring-2';

const okBorder = 'border-cream-300 focus:border-brand-500 focus:ring-brand-200';
const badBorder = 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-200';

function cls(invalid: boolean | undefined, extra?: string) {
  return `${base} ${invalid ? badBorder : okBorder} ${extra ?? ''}`;
}

export function Input({ invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={cls(invalid, props.className)} />;
}

export function Textarea({ invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} aria-invalid={invalid || undefined} className={cls(invalid, props.className)} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  invalid?: boolean;
}

export function Select({ children, invalid, ...props }: SelectProps) {
  return (
    <select {...props} aria-invalid={invalid || undefined} className={cls(invalid, props.className)}>
      {children}
    </select>
  );
}
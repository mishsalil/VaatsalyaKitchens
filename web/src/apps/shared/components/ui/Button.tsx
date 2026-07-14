import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'whatsapp' | 'ghost' | 'danger';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  fullWidth,
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };
  const styles: Record<Variant, string> = {
    primary: 'bg-brand-900 text-cream-50 hover:bg-brand-800 focus:ring-brand-500 shadow-sm hover:shadow-lift',
    secondary: 'bg-gold-500 text-brand-950 hover:bg-gold-400 focus:ring-gold-400 shadow-sm',
    outline: 'border border-brand-900 text-brand-900 hover:bg-brand-900 hover:text-cream-50 focus:ring-brand-500',
    whatsapp: 'bg-[#25D366] text-white hover:bg-[#1ebe5b] focus:ring-green-400 shadow-sm',
    ghost: 'text-brand-700 hover:bg-cream-100 focus:ring-brand-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${styles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
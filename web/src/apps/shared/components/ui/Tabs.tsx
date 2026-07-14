import type { ReactNode } from 'react';

export type Tab = {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
};

type Props = {
  tabs: Tab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
};

/**
 * A clean accessible tab bar with a maroon active underline. Used by MyAccount.
 */
export function Tabs({ tabs, value, onChange, className = '' }: Props) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 overflow-x-auto no-scrollbar border-b border-cream-200 ${className}`}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-colors ${
              active ? 'text-brand-900' : 'text-brand-400 hover:text-brand-700'
            }`}
          >
            {t.icon}
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold text-gold-800">
                {t.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-900" />
            )}
          </button>
        );
      })}
    </div>
  );
}
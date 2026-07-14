import type { ReactNode } from 'react';

type Props = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: 'maroon' | 'gold' | 'emerald';
};

/** Compact dashboard stat tile. */
export function StatTile({ icon, label, value, hint, accent = 'maroon' }: Props) {
  const accentBg =
    accent === 'gold' ? 'bg-gold-100 text-gold-700' : accent === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700';
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentBg}`}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand-400">{label}</p>
          <p className="text-xl font-bold text-brand-900">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-brand-400">{hint}</p>}
    </div>
  );
}
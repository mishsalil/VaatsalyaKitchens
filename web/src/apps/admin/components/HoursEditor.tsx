import { useState } from 'react';
import { Plus, Trash2, CopyPlus } from 'lucide-react';

export interface HourWindow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Trim "18:00:00" to "18:00" for an <input type="time">. */
const hhmm = (t: string) => t.slice(0, 5);

/**
 * A week of opening windows, editable day by day.
 *
 * Any number of windows per day, because a kitchen runs a lunch and a dinner
 * service and one open/close pair cannot say that. A day with no windows is
 * closed — that is the whole meaning, so there is no separate "closed" toggle to
 * fall out of sync with the rows.
 *
 * "Copy to all days" is the common case by a distance: hours are usually
 * identical all week and differ on one day, so the fast path is to fill one day
 * and copy, then fix the exception.
 */
export function HoursEditor({
  value,
  onChange,
  emptyLabel,
}: {
  value: HourWindow[];
  onChange: (next: HourWindow[]) => void;
  /** What no windows at all means here — differs for kitchen vs category. */
  emptyLabel: string;
}) {
  const [copiedFrom, setCopiedFrom] = useState<number | null>(null);

  const forDay = (d: number) => value.filter((w) => w.weekday === d);

  const setDay = (d: number, windows: HourWindow[]) =>
    onChange([...value.filter((w) => w.weekday !== d), ...windows]);

  const addWindow = (d: number) => {
    const existing = forDay(d);
    // A second window is almost always the dinner service, so start it in the
    // evening rather than repeating the morning the rep just typed.
    setDay(d, [
      ...existing,
      existing.length === 0
        ? { weekday: d, opens_at: '08:00', closes_at: '22:00' }
        : { weekday: d, opens_at: '18:00', closes_at: '23:00' },
    ]);
  };

  const copyToAll = (d: number) => {
    const src = forDay(d);
    const next: HourWindow[] = [];
    for (let day = 0; day < 7; day++) {
      for (const w of src) next.push({ ...w, weekday: day });
    }
    onChange(next);
    setCopiedFrom(d);
    setTimeout(() => setCopiedFrom(null), 2000);
  };

  return (
    <div className="space-y-2">
      {DAYS.map((label, d) => {
        const windows = forDay(d);
        return (
          <div key={d} className="rounded-xl border border-cream-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-brand-900">{label}</span>
              <div className="flex items-center gap-2">
                {windows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyToAll(d)}
                    className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    {copiedFrom === d ? 'Copied to all days' : 'Copy to all days'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => addWindow(d)}
                  className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Add hours
                </button>
              </div>
            </div>

            {windows.length === 0 ? (
              <p className="mt-1.5 text-xs text-brand-400">{emptyLabel}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {windows.map((w, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={hhmm(w.opens_at)}
                      onChange={(e) => {
                        const next = [...windows];
                        next[i] = { ...w, opens_at: e.target.value };
                        setDay(d, next);
                      }}
                      className="rounded-lg border border-cream-300 px-2 py-1 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
                    />
                    <span className="text-xs text-brand-400">to</span>
                    <input
                      type="time"
                      value={hhmm(w.closes_at)}
                      onChange={(e) => {
                        const next = [...windows];
                        next[i] = { ...w, closes_at: e.target.value };
                        setDay(d, next);
                      }}
                      className="rounded-lg border border-cream-300 px-2 py-1 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
                    />
                    {/* A closing time at or before the opening time runs past
                        midnight — say so, because it looks like a typo. */}
                    {hhmm(w.closes_at) <= hhmm(w.opens_at) && (
                      <span className="text-xs font-medium text-gold-700">runs past midnight</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDay(d, windows.filter((_, j) => j !== i))}
                      aria-label="Remove this window"
                      className="rounded-lg p-1 text-brand-400 hover:bg-cream-100 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MenuHours } from '../../shared/types';
import { MAX_AHEAD_MONTHS, monthCells } from '../../shared/lib/timeSlots';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shift = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); return ym(new Date(y, mo - 1 + by, 1)); };

/** Month grid; today outlined, disabled days greyed, the picked day filled. */
export function Calendar({ hours, value, onChange, now = new Date() }: { hours?: MenuHours; value: string; onChange: (date: string) => void; now?: Date }) {
  const [month, setMonth] = useState(() => (value ? value.slice(0, 7) : ym(now)));
  // Follow the picked day's month (the preselect can seed a day in the next
  // month); manual ‹ › browsing still works between picks.
  useEffect(() => { if (value) setMonth(value.slice(0, 7)); }, [value]);
  const min = ym(now);
  const max = shift(min, MAX_AHEAD_MONTHS);
  const [y, mo] = month.split('-').map(Number);
  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={month <= min} onClick={() => setMonth(shift(month, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-700 hover:bg-cream-100 disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-brand-900">{MONTHS[mo - 1]} {y}</span>
        <button type="button" aria-label="Next month" disabled={month >= max} onClick={() => setMonth(shift(month, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-700 hover:bg-cream-100 disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-brand-400">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {monthCells(month, hours, now).map((c, i) => c ? (
          <button key={c.date} type="button" disabled={c.disabled} aria-pressed={c.date === value} onClick={() => onChange(c.date)}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              c.date === value ? 'bg-brand-700 text-white' : c.disabled ? 'text-brand-300' : 'text-brand-800 hover:bg-cream-100'
            } ${c.today ? 'ring-1 ring-brand-400' : ''}`}>
            {c.day}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
    </div>
  );
}

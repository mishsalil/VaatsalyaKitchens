import type { MenuHours } from '../../shared/types';
import { dayOptions } from '../../shared/lib/timeSlots';

/** The next seven days as chips; a day the kitchen is shut is struck through. */
export function DatePicker({ hours, value, onChange }: { hours?: MenuHours; value: string; onChange: (date: string) => void }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dayOptions(hours, new Date()).map((d) => (
        <button key={d.date} type="button" disabled={d.closed} onClick={() => onChange(d.date)}
          aria-pressed={d.date === value}
          className={`chip shrink-0 ${d.date === value ? 'chip-active' : ''} ${d.closed ? 'line-through opacity-50' : ''}`}>
          {d.label}
        </button>
      ))}
    </div>
  );
}

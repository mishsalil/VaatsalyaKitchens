import type { ReactNode } from 'react';
import { CalendarDays, Sun, Sunrise } from 'lucide-react';
import { Input } from '../../shared/components/ui/Input';

/**
 * datetime-local input + quick chips (Today / Tomorrow / Weekend). Emits the
 * raw datetime-local string; the parent converts it to the human-readable
 * "Sat 20 Jul, 1:00 PM" via formatNeededOn at submit time (keeps the schema's
 * free-text needed_on unchanged for the admin + phone flow).
 */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (dtLocal: string) => void }) {
  const toLocalInput = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const quick = (label: string, date: Date, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(toLocalInput(date))}
      className="chip"
    >
      {icon} {label}
    </button>
  );

  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 13, 0);
  const saturday = (() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = (6 - d.getDay() + 7) % 7 || 7; // next Saturday (today if Sat → next week)
    d.setDate(d.getDate() + diff);
    d.setHours(12, 0);
    return d;
  })();

  return (
    <div>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
        <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="pl-10" required />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {quick('Today', new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0), <Sun className="h-4 w-4" />)}
        {quick('Tomorrow', tomorrow, <Sunrise className="h-4 w-4" />)}
        {quick('This Saturday', saturday, <CalendarDays className="h-4 w-4" />)}
      </div>
    </div>
  );
}
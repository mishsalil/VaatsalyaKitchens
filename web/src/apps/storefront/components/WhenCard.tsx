import { Clock } from 'lucide-react';
import type { MenuHours } from '../../shared/types';
import { FieldError } from '../../shared/components/ui/Field';
import { LEAD_MINUTES, describeSlot } from '../../shared/lib/timeSlots';
import { Calendar } from './Calendar';
import { TimePicker } from './TimePicker';

interface WhenCardProps {
  hours?: MenuHours;
  scheduled: boolean;
  onScheduled: (on: boolean) => void;
  date: string;
  time: string;
  onDate: (date: string) => void;
  onTime: (time: string) => void;
  error: string;
  /** The kitchen is closed right now — ASAP isn't possible, so the switch is on and locked. */
  forced: boolean;
}

/** The checkout "When" card: ASAP by default, calendar + times behind "Schedule for later". */
export function WhenCard({ hours, scheduled, onScheduled, date, time, onDate, onTime, error, forced }: WhenCardProps) {
  const summary = scheduled
    ? date && time ? describeSlot(date, time) : 'Pick a day and time'
    : `Ready in about ${LEAD_MINUTES} min`;
  return (
    <section id="when-field" className="card-soft p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">When</h2>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex items-start gap-2 text-sm text-brand-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <span>{scheduled ? <><span className="font-semibold">Scheduled</span> · {summary}</> : <span className="font-semibold">{summary}</span>}</span>
        </span>
        <label className="flex shrink-0 items-center gap-2 text-sm text-brand-600">
          Schedule for later
          <button type="button" role="switch" aria-checked={scheduled} aria-label="Schedule for later" disabled={forced} onClick={() => onScheduled(!scheduled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${scheduled ? 'bg-brand-700' : 'bg-cream-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${scheduled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>
      {forced && <p className="mt-2 text-sm text-brand-500">The kitchen is closed right now — pick a time.</p>}
      {error && <FieldError message={error} />}
      {scheduled && (
        <div className="mt-4 space-y-4">
          <Calendar hours={hours} value={date} onChange={onDate} />
          <TimePicker hours={hours} date={date} value={time} onChange={onTime} />
        </div>
      )}
    </section>
  );
}

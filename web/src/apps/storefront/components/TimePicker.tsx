import { useEffect } from 'react';
import type { MenuHours } from '../../shared/types';
import { slotsFor, slotGroups } from '../../shared/lib/timeSlots';

/** 30-minute slots for the chosen day, from the kitchen's windows, grouped Morning / Afternoon / Evening. */
export function TimePicker({ hours, date, value, onChange }: { hours?: MenuHours; date: string; value: string; onChange: (time: string) => void }) {
  const slots = slotsFor(hours, date, new Date());
  const slotsKey = slots.join(',');
  // Self-heal: the chosen slot can fall out of the list (the clock moved past
  // it while the customer filled in the form, or the day changed under it).
  // Snap to the first available slot rather than submitting a stale time.
  useEffect(() => {
    if (date && !slots.includes(value)) onChange(slots[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey, value]);
  if (slots.length === 0) return <p className="text-sm text-brand-500">Nothing left today — pick another day.</p>;
  const show = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`; };
  return (
    <div className="space-y-3">
      {slotGroups(slots).map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500">{g.label}</p>
          <div className="flex flex-wrap gap-2">
            {g.slots.map((t) => (
              <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={t === value}
                className={`chip ${t === value ? 'chip-active' : ''}`}>{show(t)}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

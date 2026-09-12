import type { HourWindow, MenuHours } from '../types';

export const SLOT_MINUTES = 30;
export const LEAD_MINUTES = 40;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = (t: string) => { const [h = 0, m = 0] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The kitchen's windows on a weekday; a default day when hours are unconfigured. */
function windowsOn(hours: MenuHours | undefined, weekday: number): HourWindow[] {
  if (!hours || hours.kitchen.length === 0) return [{ weekday, opens_at: '08:00:00', closes_at: '22:00:00' }];
  return hours.kitchen.filter((w) => w.weekday === weekday);
}

export function dayOptions(hours: MenuHours | undefined, now: Date, days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAYS[d.getDay()]} ${d.getDate()}`;
    out.push({ date: isoDate(d), label, closed: windowsOn(hours, d.getDay()).length === 0 });
  }
  return out;
}

export function slotsFor(hours: MenuHours | undefined, date: string, now: Date): string[] {
  const [y, mo, da] = date.split('-').map(Number);
  const day = new Date(y, mo - 1, da);
  const today = isoDate(now) === date;
  // Earliest slot today: now + lead, snapped UP to the grid.
  const floor = today ? Math.ceil((now.getHours() * 60 + now.getMinutes() + LEAD_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES : 0;
  const out: string[] = [];
  for (const w of windowsOn(hours, day.getDay())) {
    const o = mins(w.opens_at);
    const c = mins(w.closes_at) > o ? mins(w.closes_at) : 24 * 60 - SLOT_MINUTES; // overnight window: stop before midnight
    for (let m = Math.ceil(o / SLOT_MINUTES) * SLOT_MINUTES; m <= c; m += SLOT_MINUTES) {
      if (m >= floor && !out.includes(hhmm(m))) out.push(hhmm(m));
    }
  }
  return out.sort();
}

export function firstAvailable(hours: MenuHours | undefined, now: Date): { date: string; time: string } | null {
  for (const d of dayOptions(hours, now)) {
    const s = slotsFor(hours, d.date, now);
    if (s.length) return { date: d.date, time: s[0] };
  }
  return null;
}

export function toLocalValue(date: string, time: string): string {
  return `${date}T${time}`;
}

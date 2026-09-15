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
  for (const d of dayOptions(hours, now, 14)) {
    const s = slotsFor(hours, d.date, now);
    if (s.length) return { date: d.date, time: s[0] };
  }
  return null;
}

export function toLocalValue(date: string, time: string): string {
  return `${date}T${time}`;
}

export const MAX_AHEAD_MONTHS = 12;
/** "As soon as possible (about 40 min)" — the needed_on text for an ASAP order. */
export const ASAP_TEXT = 'As soon as possible';

/** now + LEAD_MINUTES, snapped UP to 5 minutes. */
export function asapAt(now: Date): Date {
  const t = new Date(now.getTime() + LEAD_MINUTES * 60_000);
  t.setSeconds(0, 0);
  const m = t.getMinutes();
  if (m % 5) t.setMinutes(m + (5 - (m % 5)));
  return t;
}

export type DayCell = { date: string; day: number; disabled: boolean; today: boolean } | null;

/** Six rows of seven for the month containing `ym` (YYYY-MM). Disabled: before today, after today+12 months, or a weekday the kitchen never opens. */
export function monthCells(ym: string, hours: MenuHours | undefined, now: Date): DayCell[] {
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const daysIn = new Date(y, mo, 0).getDate();
  const todayIso = isoDate(now);
  const max = new Date(now.getFullYear(), now.getMonth() + MAX_AHEAD_MONTHS, now.getDate());
  const cells: DayCell[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysIn; d++) {
    const dt = new Date(y, mo - 1, d);
    const iso = isoDate(dt);
    cells.push({
      date: iso,
      day: d,
      today: iso === todayIso,
      disabled: iso < todayIso || dt > max || windowsOn(hours, dt.getDay()).length === 0,
    });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** 'Morning' (< 12:00) | 'Afternoon' (12:00–16:59) | 'Evening' (≥ 17:00). */
export function slotGroups(slots: string[]): { label: string; slots: string[] }[] {
  const g = { Morning: [] as string[], Afternoon: [] as string[], Evening: [] as string[] };
  for (const s of slots) {
    const h = Number(s.slice(0, 2));
    (h < 12 ? g.Morning : h < 17 ? g.Afternoon : g.Evening).push(s);
  }
  return Object.entries(g)
    .filter(([, v]) => v.length)
    .map(([label, slots]) => ({ label, slots }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat 19 Sep, 7:30 PM" for the When card's summary line. */
export function describeSlot(date: string, time: string): string {
  const [y, mo, da] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const dt = new Date(y, mo - 1, da);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${DAYS[dt.getDay()]} ${da} ${MONTHS[mo - 1]}, ${h12}:${pad(m)} ${ampm}`;
}

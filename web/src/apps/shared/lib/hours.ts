import type { HourWindow, MenuHours } from '../types';

/**
 * Client-side mirror of includes/hours.php.
 *
 * The server is the authority and re-checks everything on order create. This
 * exists so a customer is guided BEFORE they submit — greying out a section
 * that is not being cooked, and steering the date picker to a slot that will
 * actually be accepted — rather than filling a cart and being refused.
 *
 * The two rules that matter, kept identical to the PHP:
 *   1. A window whose close is at or before its open runs past midnight, so a
 *      moment can match either its own day's window or yesterday's tail.
 *   2. A category window is an intersection, never a grant — a category is open
 *      only where its window and the kitchen's overlap.
 */

const DAY_MS = 86_400_000;

const secs = (t: string): number => {
  const [h = 0, m = 0, s = 0] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

const atSecs = (d: Date): number => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

/** Is `when` inside any of these windows? */
export function within(windows: HourWindow[], when: Date): boolean {
  const day = when.getDay();
  const now = atSecs(when);

  for (const w of windows) {
    if (w.weekday !== day) continue;
    const o = secs(w.opens_at);
    const c = secs(w.closes_at);
    if (c > o) {
      if (now >= o && now <= c) return true;
    } else if (now >= o) {
      return true; // runs into tomorrow
    }
  }
  // Tail of a window that opened yesterday.
  const prev = (day + 6) % 7;
  for (const w of windows) {
    if (w.weekday !== prev) continue;
    const o = secs(w.opens_at);
    const c = secs(w.closes_at);
    if (c <= o && now <= c) return true;
  }
  return false;
}

export function kitchenOpenAt(hours: MenuHours | undefined, when: Date): boolean {
  if (!hours || hours.kitchen.length === 0) return true; // unconfigured = unrestricted
  return within(hours.kitchen, when);
}

export function categoryOpenAt(hours: MenuHours | undefined, categoryId: number, when: Date): boolean {
  if (!kitchenOpenAt(hours, when)) return false;
  const own = hours?.categories?.[String(categoryId)];
  return own && own.length > 0 ? within(own, when) : true;
}

/**
 * The next moment the kitchen opens at or after `from`, scanning in 5-minute
 * steps over two weeks. Coarser than the server's minute scan because this only
 * has to suggest a slot — the server decides whether it is acceptable.
 */
export function nextOpenFrom(hours: MenuHours | undefined, from: Date): Date | null {
  if (!hours || hours.kitchen.length === 0) return from;
  const t = new Date(from);
  t.setSeconds(0, 0);
  // Round up to the next 5-minute mark so suggestions look deliberate.
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
  for (let i = 0; i < (14 * 24 * 60) / 5; i++) {
    if (kitchenOpenAt(hours, t)) return t;
    t.setMinutes(t.getMinutes() + 5);
  }
  return null;
}

/** Next slot at which this specific category can be cooked. */
export function nextOpenForCategory(
  hours: MenuHours | undefined,
  categoryId: number,
  from: Date,
): Date | null {
  const t = new Date(from);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
  for (let i = 0; i < (14 * 24 * 60) / 5; i++) {
    if (categoryOpenAt(hours, categoryId, t)) return t;
    t.setMinutes(t.getMinutes() + 5);
  }
  return null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pretty = (t: string): string => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
};

/** "Monday — 11:00 AM – 3:00 PM, 6:00 PM – 11:00 PM" for each day of the week. */
export function describeWeek(windows: HourWindow[]): { day: string; text: string }[] {
  return DAY_NAMES.map((day, i) => {
    const forDay = windows.filter((w) => w.weekday === i);
    return {
      day,
      text: forDay.length
        ? forDay
            .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
            .map((w) => `${pretty(w.opens_at)} – ${pretty(w.closes_at)}`)
            .join(', ')
        : 'Closed',
    };
  });
}

/** "today at 6:00 PM" / "Thu 4 Sep, 11:00 AM" — for telling someone when to come back. */
export function describeWhen(d: Date, now = new Date()): string {
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameDay) return `today at ${time}`;
  if (d.getTime() - now.getTime() < 2 * DAY_MS && d.getDate() === now.getDate() + 1) {
    return `tomorrow at ${time}`;
  }
  return `${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

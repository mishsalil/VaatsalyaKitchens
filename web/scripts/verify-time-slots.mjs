/** Date/time chips are built from the opening hours the menu already carries. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/timeSlots.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { dayOptions, slotsFor, firstAvailable } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
// Sat 2026-09-12 (weekday 6). Kitchen: Mon–Sat 11:00–15:00 and 18:00–22:00; Sunday closed.
const win = (weekday, o, c) => ({ weekday, opens_at: o, closes_at: c });
const kitchen = [];
for (const d of [1, 2, 3, 4, 5, 6]) kitchen.push(win(d, '11:00:00', '15:00:00'), win(d, '18:00:00', '22:00:00'));
const hours = { kitchen, categories: {}, open_now: true, closed_category_ids: [], next_open_at: null, server_now: '' };
const at = (h, m = 0) => new Date(2026, 8, 12, h, m);

console.log('dayOptions');
const days = dayOptions(hours, at(10));
check('seven days', 7, days.length);
check('labels', ['Today', 'Tomorrow', 'Mon 14'], days.slice(0, 3).map((d) => d.label));
check('sunday is closed', true, days[1].closed);
check('dates', '2026-09-12', days[0].date);
check('unconfigured: nothing closed', false, dayOptions(undefined, at(10)).some((d) => d.closed));

console.log('\nslotsFor');
check('a future day lists both windows', ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'], slotsFor(hours, '2026-09-14', at(10)));
check('today at 10:00: lead of 40 min keeps 11:00', '11:00', slotsFor(hours, '2026-09-12', at(10))[0]);
check('today at 12:50: 13:30 is first (12:50+40 = 13:30)', '13:30', slotsFor(hours, '2026-09-12', at(12, 50))[0]);
check('today at 12:41: 13:30 (13:21 snaps up)', '13:30', slotsFor(hours, '2026-09-12', at(12, 41))[0]);
check('today at 14:50: afternoon gone, evening remains', '18:00', slotsFor(hours, '2026-09-12', at(14, 50))[0]);
check('today at 21:45: nothing left', [], slotsFor(hours, '2026-09-12', at(21, 45)));
check('closed day is empty', [], slotsFor(hours, '2026-09-13', at(10)));
check('unconfigured hours: 08:00–22:00', ['08:00', '22:00'], (() => { const s = slotsFor(undefined, '2026-09-14', at(10)); return [s[0], s[s.length - 1]]; })());

console.log('\nfirstAvailable');
check('today when it has a slot', { date: '2026-09-12', time: '11:00' }, firstAvailable(hours, at(10)));
check('skips a closed Sunday to Monday', { date: '2026-09-14', time: '11:00' }, firstAvailable(hours, at(21, 45)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

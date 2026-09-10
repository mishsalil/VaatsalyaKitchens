/**
 * Dish grouping for the rating page.
 *
 * A party order lists the same dish several times across variants. Asking
 * someone to rate paneer three times is how you get no ratings at all, so the
 * page groups by menu_item_id — but the DATABASE still stores one row per
 * order_items row, so every group must carry the ids it covers.
 *
 * Order lines created before migration_007 have menu_item_id = null and can
 * never be attributed to a dish; those group by name instead, and must never
 * be merged with each other just because they are both null.
 *
 * Uses esbuild to strip the types rather than a regex. A test harness that
 * needs its own parser is a test harness that will lie to you.
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/rateLines.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { groupRateLines } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

const item = (id, menuId, name, qty = 1) =>
  ({ order_item_id: id, menu_item_id: menuId, item_name: name, qty });

console.log('the simple case');
check('one line, one group', [{ key: 'm:7', label: 'Paneer Butter Masala', qty: 2, orderItemIds: [1] }],
  groupRateLines([item(1, 7, 'Paneer Butter Masala', 2)]));

console.log('\nsame dish across variants collapses');
check('two variants of one dish',
  [{ key: 'm:7', label: 'Paneer Butter Masala', qty: 3, orderItemIds: [1, 2] }],
  groupRateLines([item(1, 7, 'Paneer Butter Masala', 2), item(2, 7, 'Paneer Butter Masala', 1)]));

console.log('\ndifferent dishes stay apart, in first-seen order');
check('two dishes', [
  { key: 'm:7', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'm:9', label: 'Dal', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, 7, 'Paneer'), item(2, 9, 'Dal')]));

console.log('\npre-migration_007 lines group by name, never by null');
check('two different unattributed dishes stay apart', [
  { key: 'n:Paneer', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'n:Dal', label: 'Dal', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, null, 'Paneer'), item(2, null, 'Dal')]));

check('same unattributed dish merges',
  [{ key: 'n:Paneer', label: 'Paneer', qty: 4, orderItemIds: [1, 2] }],
  groupRateLines([item(1, null, 'Paneer', 3), item(2, null, 'Paneer', 1)]));

check('an id-bearing line never merges with a null one', [
  { key: 'm:7', label: 'Paneer', qty: 1, orderItemIds: [1] },
  { key: 'n:Paneer', label: 'Paneer', qty: 1, orderItemIds: [2] },
], groupRateLines([item(1, 7, 'Paneer'), item(2, null, 'Paneer')]));

console.log('\nedges');
check('empty order', [], groupRateLines([]));
check('quantities sum, not count', [{ key: 'm:7', label: 'P', qty: 12, orderItemIds: [1, 2] }],
  groupRateLines([item(1, 7, 'P', 5), item(2, 7, 'P', 7)]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

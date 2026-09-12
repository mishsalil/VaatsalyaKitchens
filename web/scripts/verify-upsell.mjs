/** "Goes well with": rule order, skips, and the cap of four. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/upsell.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { suggestUpsells } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
const categories = [
  { id: 7, name: 'Starters', sort_order: 1 }, { id: 9, name: 'Fried Rice and Noodles', sort_order: 2 },
  { id: 12, name: 'Main Course', sort_order: 3 }, { id: 13, name: 'Tandoori Breads', sort_order: 4 },
  { id: 14, name: 'Tawa Breads', sort_order: 5 }, { id: 15, name: 'Rice and Biryani', sort_order: 6 },
  { id: 16, name: 'Salads', sort_order: 7 },
];
const it = (id, category_id, name, price, sort_order = 0) => ({ id, category_id, subcategory_id: null, name, price, unit: '', variants: [], addons: [], sort_order });
const items = [
  it(1, 12, 'Paneer Butter Masala', 249), it(2, 13, 'Butter Naan', 40, 1), it(3, 13, 'Tandoori Roti', 15, 0),
  it(4, 14, 'Paratha', 30), it(5, 15, 'Jeera Rice', 120), it(6, 16, 'Green Salad', 60), it(7, 7, 'Paneer Tikka', 249),
  it(8, 9, 'Veg Noodles', 180), it(9, 12, 'Dal Fry', 149),
];
const names = (r) => r.map((x) => x.name);
const run = (cart, closed = []) => names(suggestUpsells({ items, categories, cartItemIds: cart, closedCategoryIds: closed }));

check('main course → two breads (sort order), a rice, a salad', ['Tandoori Roti', 'Butter Naan', 'Jeera Rice', 'Green Salad'], run([1]));
check('main + bread already → rice, salad, then fill', ['Jeera Rice', 'Green Salad', 'Paneer Tikka', 'Veg Noodles'], run([1, 2]));
check('starter only → a main, salad, fill', ['Dal Fry', 'Green Salad', 'Tandoori Roti', 'Paratha'], run([7]));
check('chinese only → a main first', 'Dal Fry', run([8])[0]);
check('closed category skipped', ['Butter Naan', 'Paratha', 'Jeera Rice', 'Green Salad'].includes(run([1], [13])[0]) && !run([1], [13]).includes('Tandoori Roti'), true);
check('never suggests what is in the cart', false, run([1, 5]).includes('Jeera Rice'));
check('cap of four', 4, run([]).length);
check('max honoured', 2, suggestUpsells({ items, categories, cartItemIds: [1], closedCategoryIds: [], max: 2 }).length);
check('unknown category names degrade to fill', 4, suggestUpsells({ items, categories: categories.map((c) => ({ ...c, name: 'X' + c.id })), cartItemIds: [1], closedCategoryIds: [] }).length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

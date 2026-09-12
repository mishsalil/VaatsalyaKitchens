/** Cart helpers with several variant groups: stable keys, summed deltas, grouping. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/types/index.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { cartKey, linePrice, variantsText, groupVariants } =
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

console.log('cartKey');
check('no options', '7::::', cartKey(7));
check('variant ids sorted', '7::3,12::', cartKey(7, [12, 3]));
check('same key regardless of order', cartKey(7, [3, 12], [9, 4]), cartKey(7, [12, 3], [4, 9]));
check('zero ids dropped', '7::5::', cartKey(7, [0, 5]));

console.log('\nlinePrice');
const line = { key: 'k', id: 1, name: 'Veg Noodles', unit: '', basePrice: 200,
  variants: [{ id: 12, name: 'Ghee', priceDelta: 20 }, { id: 14, name: 'Without Vegetables', priceDelta: 0 }],
  addons: [{ id: 30, name: 'Extra Cheese', price: 20 }], qty: 2 };
check('base + deltas + addons', 240, linePrice(line));
check('no variants', 200, linePrice({ ...line, variants: [], addons: [] }));

console.log('\nvariantsText');
check('joined', 'Ghee, Without Vegetables', variantsText(line.variants));
check('empty is undefined', undefined, variantsText([]));

console.log('\ngroupVariants');
const vs = [
  { id: 13, name: 'With Vegetables', group_label: 'Vegetables', price_delta: 0, is_default: true, sort_order: 100 },
  { id: 11, name: 'Normal', group_label: 'Preparation', price_delta: 0, is_default: false, sort_order: 0 },
  { id: 12, name: 'Ghee', group_label: 'Preparation', price_delta: 20, is_default: false, sort_order: 1 },
  { id: 14, name: 'Without Vegetables', group_label: 'Vegetables', price_delta: 0, is_default: false, sort_order: 101 },
];
const g = groupVariants(vs);
check('groups ordered by first row', ['Preparation', 'Vegetables'], g.map((x) => x.label));
check('options in sort order', [11, 12], g[0].options.map((o) => o.id));
check('default is the marked row', 13, g[1].defaultId);
check('no marked default → first option', 11, g[0].defaultId);
check('none → empty', [], groupVariants([]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

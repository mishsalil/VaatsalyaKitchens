/** The counter's discount meter and the customer's offer copy. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/discounts.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { discountMeter, codeAmount, offerText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

console.log('discountMeter');
check('10 + 5 → ok', { total: 15, tone: 'ok', text: 'Total discount 15 % of 24 % max' }, discountMeter(10, 5));
check('18 exactly → ok', 'ok', discountMeter(10, 8).tone);
check('18.01 → warn', 'warn', discountMeter(10, 8.01).tone);
check('24 → warn, still allowed', { total: 24, tone: 'warn' }, (({ total, tone }) => ({ total, tone }))(discountMeter(12, 12)));
check('24.01 → over with the ceiling text', { tone: 'over', text: 'Over the 24 % ceiling — reduce the manual discount or remove the code.' },
  (({ tone, text }) => ({ tone, text }))(discountMeter(12, 12.01)));
check('rounds to 2 places', 15.5, discountMeter(10.25, 5.25).total);
check('code alone above the ceiling → code-only', { tone: 'code-only', text: 'Code alone — no manual discount can be added.' },
  (({ tone, text }) => ({ tone, text }))(discountMeter(50, 0)));
check('code alone + 1 % manual → over', 'over', discountMeter(50, 1).tone);
check('12 + 12 → warn', 'warn', discountMeter(12, 12).tone);

console.log('\ncodeAmount');
check('10 % of 1000', 100, codeAmount(1000, 10, 150));
check('capped', 150, codeAmount(2000, 10, 150));
check('rounded to paise', 33.33, codeAmount(333.33, 10, 150));

console.log('\nofferText');
check('first order', '15 % off your first order, up to ₹100', offerText({ code: 'WELCOME', pct: 15, max_amount: 100, min_order: 0, first_order_only: true }));
check('flat with floor', '10 % off orders above ₹400, up to ₹150', offerText({ code: 'VK10', pct: 10, max_amount: 150, min_order: 400, first_order_only: false }));
check('no floor', '10 % off, up to ₹150', offerText({ code: 'VK10', pct: 10, max_amount: 150, min_order: 0, first_order_only: false }));
check('comeback', '30 % off — welcome back! up to ₹150', offerText({ code: 'COMEBACK', kind: 'comeback', pct: 30, max_amount: 150, min_order: 0, first_order_only: false }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

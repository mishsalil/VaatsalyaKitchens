/** Which checkout field a server refusal belongs to. */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/focusError.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { checkoutFieldFor } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};

console.log('checkoutFieldFor');
check('your name → name', 'name', checkoutFieldFor('Please write your name.'));
check('phone number → phone', 'phone', checkoutFieldFor('Please write a 10-digit phone number.'));
check('when you need the food → when', 'when', checkoutFieldFor('Please tell us when you need the food.'));
check('We are closed → when', 'when', checkoutFieldFor('We are closed then. Please pick a time during our opening hours.'));
check('address → address', 'address', checkoutFieldFor('Please choose a delivery address.'));
check('at least one dish → order', 'order', checkoutFieldFor('Please choose at least one dish.'));
check('Please choose → order', 'order', checkoutFieldFor('Please choose a dish from the menu.'));
check('code → code', 'code', checkoutFieldFor('That code has expired.'));
check('anything else → form', 'form', checkoutFieldFor('Something went wrong. Please try again.'));
check('names the applied code → code (before phone)', 'code', checkoutFieldFor('Enter your phone number to use WELCOME.', 'WELCOME'));
check('phone message with a code applied → phone', 'phone', checkoutFieldFor('Please write a 10-digit phone number.', 'WELCOME'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

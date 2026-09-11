/**
 * "House, Landmark, Area" into the one address_text column. Blank parts are
 * skipped so the line never reads "Flat 3, , ".
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/addressText.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { composeAddressText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  if (expected === actual) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${JSON.stringify(expected)}\n         got      ${JSON.stringify(actual)}`); }
};

check('all three', 'Flat 3, Mishra Niwas, near Shiv Mandir, Badaura, Sitapur',
  composeAddressText({ house: 'Flat 3, Mishra Niwas', landmark: 'near Shiv Mandir', area: 'Badaura, Sitapur' }));
check('no landmark', 'Flat 3, Badaura', composeAddressText({ house: 'Flat 3', landmark: '', area: 'Badaura' }));
check('no area (geocoder said nothing)', 'Flat 3, near Shiv Mandir', composeAddressText({ house: 'Flat 3', landmark: 'near Shiv Mandir', area: '' }));
check('house only', 'Flat 3', composeAddressText({ house: 'Flat 3', landmark: '', area: '' }));
check('whitespace-only parts are blank', 'Flat 3', composeAddressText({ house: ' Flat 3 ', landmark: '   ', area: '\t' }));
check('all blank is empty string', '', composeAddressText({ house: '', landmark: '', area: '' }));
check('a trailing comma in a part does not double up', 'Flat 3, Badaura', composeAddressText({ house: 'Flat 3,', landmark: '', area: 'Badaura' }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

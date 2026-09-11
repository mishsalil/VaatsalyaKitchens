/**
 * Coordinates out of every shape of Google Maps link WhatsApp produces, plus a
 * bare "lat, lng". A short link (maps.app.goo.gl) must return null rather than
 * a guess — the server resolves those by following the redirect.
 *
 * Uses esbuild to strip the types rather than a regex. A test harness that
 * needs its own parser is a test harness that will lie to you.
 */
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/apps/shared/lib/mapsLink.ts', import.meta.url), 'utf8');
const { code } = await transform(src, { loader: 'ts', format: 'esm' });
const { parseMapsLink, isShortMapsLink, directionsUrl } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

let pass = 0, fail = 0;
const check = (what, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}\n         expected ${e}\n         got      ${a}`); }
};
const P = { lat: 27.5680123, lng: 80.6789456 };

console.log('URL shapes');
check('?q=lat,lng', P, parseMapsLink('https://www.google.com/maps?q=27.5680123,80.6789456'));
check('maps.google.com/?q=', P, parseMapsLink('https://maps.google.com/?q=27.5680123,80.6789456'));
check('search ?api=1&query=', P, parseMapsLink('https://www.google.com/maps/search/?api=1&query=27.5680123%2C80.6789456'));
check('/place/…/@lat,lng,17z', P, parseMapsLink('https://www.google.com/maps/place/Mishra+Niwas/@27.5680123,80.6789456,17z/data=!3m1!4b1'));
check('/maps/@lat,lng,15z', P, parseMapsLink('https://www.google.com/maps/@27.5680123,80.6789456,15z'));
check('/dir/…/destination', P, parseMapsLink('https://www.google.com/maps/dir/?api=1&destination=27.5680123,80.6789456'));
check('!3d lat !4d lng in data blob', P, parseMapsLink('https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d27.5680123!4d80.6789456'));

console.log('\nbare pairs');
check('lat,lng', P, parseMapsLink('27.5680123,80.6789456'));
check('lat, lng with spaces', P, parseMapsLink(' 27.5680123 , 80.6789456 '));
check('negative longitude accepted', { lat: 40.7, lng: -74.0 }, parseMapsLink('40.7,-74.0'));

console.log('\nrefusals');
check('latitude out of range', null, parseMapsLink('95.6789456,27.5680123'));
check('junk', null, parseMapsLink('call me at 9623836382'));
check('empty', null, parseMapsLink(''));
check('a phone number is not a pair', null, parseMapsLink('96238,36382'));
check('short link returns null, not a guess', null, parseMapsLink('https://maps.app.goo.gl/AbCdEfGh12'));

console.log('\nshort-link detection');
check('maps.app.goo.gl', true, isShortMapsLink('https://maps.app.goo.gl/AbCdEfGh12'));
check('goo.gl/maps', true, isShortMapsLink('https://goo.gl/maps/AbCdEf'));
check('full link is not short', false, isShortMapsLink('https://www.google.com/maps?q=1,2'));
check('junk is not short', false, isShortMapsLink('hello'));

console.log('\ndirections');
check('directions URL', 'https://www.google.com/maps/dir/?api=1&destination=27.5680123%2C80.6789456', directionsUrl(27.5680123, 80.6789456));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

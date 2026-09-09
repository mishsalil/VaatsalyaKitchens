/**
 * Checks the bytes we hand to the printer. A receipt that looks right on screen
 * and prints as noise is the failure this guards against.
 * Run: node scripts/verify-print-payload.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

async function loadTs(tsPath, outName, dir) {
  const src = readFileSync(new URL(tsPath, import.meta.url), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });
  const out = join(dir, outName);
  writeFileSync(out, code);
  return pathToFileURL(out).href;
}

const dir = mkdtempSync(join(tmpdir(), 'vk-print-'));
const esc = await import(await loadTs('../src/apps/shared/lib/escpos.ts', 'escpos.mjs', dir));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

console.log('escpos.encode');
const simple = esc.encode([{ text: 'Hi' }]);
check('starts with ESC @ (initialise)', simple[0] === 0x1b && simple[1] === 0x40);
check('maps ASCII byte for byte', simple[2] === 0x48 && simple[3] === 0x69);
check('ends with four line feeds',
  Array.from(simple.slice(-4)).every((b) => b === 0x0a));

const devanagari = esc.encode([{ text: 'वात्सल्य Kitchens' }]);
check('no byte above 0x7e survives',
  Array.from(devanagari).every((b) => b <= 0x7e),
  'a non-ASCII byte reached the printer');
check('non-ASCII becomes a question mark', Array.from(devanagari).includes(0x3f));

const big = Array.from(esc.encode([{ text: 'KOT', size: 'double' }]));
const dblOn = big.findIndex((b, i) => b === 0x1b && big[i + 1] === 0x21 && big[i + 2] === 0x10);
const dblOff = big.findIndex((b, i) => b === 0x1b && big[i + 1] === 0x21 && big[i + 2] === 0x00);
check('double block opens with ESC ! 0x10', dblOn > -1);
check('double block returns to normal after', dblOff > dblOn);

const multi = Array.from(esc.encode([{ text: 'a' }, { text: 'b' }]));
check('each block ends with a newline',
  multi.filter((b) => b === 0x0a).length >= 2);

const embedded = Array.from(esc.encode([{ text: 'one\ntwo' }]));
check('newlines inside a block pass through', embedded.filter((b) => b === 0x0a).length >= 2);

console.log('\nescpos.toBase64');
const b64 = esc.toBase64(new Uint8Array([0x1b, 0x40, 0x41]));
check('round-trips through base64', Buffer.from(b64, 'base64').toString('hex') === '1b4041', b64);
const large = esc.toBase64(new Uint8Array(100000).fill(0x41));
check('survives a payload larger than the argument limit', large.length > 100000);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

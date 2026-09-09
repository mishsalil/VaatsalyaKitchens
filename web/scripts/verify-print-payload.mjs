/**
 * Checks the bytes we hand to the printer. A receipt that looks right on screen
 * and prints as noise is the failure this guards against.
 * Run: node scripts/verify-print-payload.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform, build } from 'esbuild';

async function loadTs(tsPath, outName, dir) {
  const src = readFileSync(new URL(tsPath, import.meta.url), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });
  const out = join(dir, outName);
  writeFileSync(out, code);
  return pathToFileURL(out).href;
}

async function loadTsBundle(tsPath, outName, dir) {
  const out = join(dir, outName);
  const tsUrl = new URL(tsPath, import.meta.url);
  const tsFullPath = tsUrl.pathname.replace(/^\/([A-Z]:)/, '$1'); // Fix Windows paths
  await build({ entryPoints: [tsFullPath], outfile: out, bundle: true, format: 'esm', platform: 'node' });
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
check('ends with the block\'s own feed plus four trailing line feeds',
  Array.from(simple.slice(-5)).every((b) => b === 0x0a));

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

const receipt = await import(await loadTs('../src/apps/shared/lib/receiptText.ts', 'receiptText.mjs', dir));
const kot = await import(await loadTsBundle('../src/apps/shared/lib/kitchenTicket.ts', 'kot.mjs', dir));

const order = {
  id: 41,
  name: 'Apurva Sharma',
  phone: '6393306919',
  needed_on: 'Today 8:15 PM',
  address_text: null,
  notes: 'Spicy, no onion',
  created_at: '2026-09-06T13:20:00',
  items: [
    { item_name: 'Kadai Paneer', qty: 1, price: 299, unit: 'plate' },
    { item_name: 'Tandoori Paneer Tikka Grilled Sandwich Platter', variant_name: 'Full',
      addons_text: 'Extra cheese', qty: 3, price: 249.5, unit: 'plate' },
  ],
  subtotal: 1047.5, discount_pct: 0, discount_amount: 0, cgst: 26.19, sgst: 26.19,
  gst_rate: 5, delivery_charge: 0, is_complimentary: false, total_estimate: 1100,
};

console.log('\nkitchenTicketBlocks');
const blocks = kot.kitchenTicketBlocks(order, 58);
const allText = blocks.map((b) => b.text).join('\n');

check('says it is the kitchen copy', /KITCHEN/i.test(allText));
check('carries the order number', allText.includes('#41'));
check('carries when it is needed', allText.includes('Today 8:15 PM'));
check('lists every item', allText.includes('Kadai Paneer') && allText.includes('Tandoori Paneer Tikka'));
check('shows quantities', /\b3\b/.test(allText) && /\b1\b/.test(allText));
check('carries the cooking note', allText.includes('Spicy, no onion'));

check('shows NO prices', !allText.includes('299') && !allText.includes('249.50'), allText);
check('shows NO tax lines', !/CGST|SGST/i.test(allText));
check('shows NO total', !/TOTAL/i.test(allText));

const cols = receipt.columnsFor(58);
const overWide = allText.split('\n').filter((l) => l.length > cols);
check('no line exceeds the paper width', overWide.length === 0,
  overWide.length ? `worst ${Math.max(...overWide.map((l) => l.length))} chars` : '');

check('items are double height', blocks.some((b) => b.size === 'double'));
check('the header is not double height', blocks[0].size !== 'double');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

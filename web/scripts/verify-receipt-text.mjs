/**
 * Checks the receipt formatters against the things that actually go wrong on a
 * thermal printer: a line one character too wide (which wraps and ruins the
 * layout), an amount column that drifts, a long dish name that swallows the
 * price, and a printed total that disagrees with the order.
 *
 * Follows the repo's verify-* convention rather than adding a test framework.
 * Run: node scripts/verify-receipt-text.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

/* The formatters are TypeScript, so they are compiled before import — with
   esbuild, which Vite already depends on, rather than a hand-rolled type
   stripper. The first attempt here did strip types with regexes and broke on a
   multi-line parameter annotation; a test harness that needs its own parser is
   a test harness that will lie to you. */
async function loadTs(tsPath, outName, dir) {
  const src = readFileSync(new URL(tsPath, import.meta.url), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });
  const out = join(dir, outName);
  writeFileSync(out, code);
  return pathToFileURL(out).href;
}

const dir = mkdtempSync(join(tmpdir(), 'vk-receipt-'));
const receipt = await import(await loadTs('../src/apps/shared/lib/receiptText.ts', 'receiptText.mjs', dir));
const slipMod = await import(await loadTs('../src/apps/shared/lib/whatsappSlip.ts', 'whatsappSlip.mjs', dir));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

const business = {
  name: 'Vaatsalya Kitchens',
  address: '#001, Mishra Niwas, Sitapur SPN Highway, Badaura, Sitapur - 261001',
  phone: '+91-9623836382',
  email: 'vaatsalyakitchens@gmail.com',
  gstin: '09AVYPM7231Q1ZE',
  fssai: '227263400000186',
  footer: 'Thank you for ordering with Vaatsalya Kitchens!',
};

const order = {
  id: 41,
  name: 'Apurva Sharma',
  phone: '6393306919',
  needed_on: 'Today 8:15 PM',
  address_text: 'Flat 402, Green Residency, near the water tank, Sitapur',
  notes: 'Spicy',
  created_at: '2026-09-06T13:20:00',
  items: [
    { item_name: 'Kadai Paneer', variant_name: null, addons_text: null, unit: 'plate', qty: 1, price: 299 },
    { item_name: 'Tawa Paratha Roti', variant_name: null, addons_text: null, unit: 'piece', qty: 2, price: 39 },
    // The nasty one: a name far longer than any line, with a variant and add-ons.
    {
      item_name: 'Tandoori Paneer Tikka Grilled Sandwich Platter',
      variant_name: 'Full',
      addons_text: 'Extra cheese, Mint chutney',
      unit: 'plate',
      qty: 3,
      price: 249.5,
    },
  ],
  subtotal: 377,
  discount_pct: 30,
  discount_amount: 113,
  cgst: 6.6,
  sgst: 6.6,
  gst_rate: 5,
  delivery_charge: 0,
  is_complimentary: false,
  total_estimate: 278,
};

for (const width of [58, 80]) {
  const cols = receipt.columnsFor(width);
  console.log(`\n${width}mm — ${cols} columns`);
  const lines = receipt.receiptLines(order, business, width);

  const tooWide = lines.filter((l) => l.length > cols);
  check('every line fits the paper', tooWide.length === 0,
    tooWide.length ? `${tooWide.length} too wide, worst ${Math.max(...tooWide.map((l) => l.length))} chars` : '');

  // The amount column: every money line must end flush at the right edge.
  const totalLine = lines.find((l) => l.startsWith('TOTAL'));
  check('total line present and flush right', !!totalLine && totalLine.length === cols,
    totalLine ? `len ${totalLine.length}` : 'missing');

  check('printed total matches the order', !!totalLine && totalLine.includes('278.00'),
    totalLine || '');

  // A long name must not eat its own price.
  const longAmount = lines.find((l) => l.includes('748.50'));
  check('long dish name keeps its amount', !!longAmount && longAmount.length <= cols,
    longAmount || 'amount 748.50 missing');

  check('discount, CGST and SGST all shown',
    lines.some((l) => l.startsWith('Discount')) &&
      lines.some((l) => l.startsWith('CGST')) &&
      lines.some((l) => l.startsWith('SGST')));
}

// wrap() is where a bad line length would come from, so probe it directly.
console.log('\nwrap()');
const longWord = 'Supercalifragilisticexpialidocious'.repeat(2);
check('splits a word longer than the line', receipt.wrap(longWord, 10).every((l) => l.length <= 10));
check('never returns an empty array', receipt.wrap('', 10).length === 1);

// The WhatsApp slip is proportional, so width does not matter — content does.
console.log('\nWhatsApp slip');
const slip = slipMod.whatsappSlip(order, business);
check('order number is ORD-date-id', slip.includes('ORD-20260906-041'), slipMod.slipOrderNumber(order));
check('items are numbered as before', slip.includes('1. Kadai Paneer - Qty: 1 x Rs 299 = Rs 299'));
check('whole rupees carry no decimals', slip.includes('Rs 299') && !slip.includes('Rs 299.00'));
check('paise are kept where they exist', slip.includes('Rs 6.60'));
check('discount line matches the old format', slip.includes('Percentage Discount: Rs 113 (30%)'));
check('total is stated', slip.includes('Total Amount: Rs 278'));
check('comments carried through', slip.includes('Comments: Spicy'));
check('no invented payment method', !/Payment:/i.test(slip), 'a payment line appeared');
check('no monospace fence', !slip.includes('```'), 'backticks would break proportional layout');

// Complimentary orders must never show a rupee total.
const free = { ...order, is_complimentary: true, total_estimate: 0 };
console.log('\ncomplimentary order');
check('slip says complimentary, not Rs 0', slipMod.whatsappSlip(free, business).includes('COMPLIMENTARY'));
check('printed bill says complimentary',
  receipt.receiptText(free, business, 58).includes('COMPLIMENTARY'));

console.log(
  failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);

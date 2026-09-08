/**
 * Turns the photographer's folders into the web-sized dish images the SPA
 * serves from /menu/{id}.webp.
 *
 *   php scripts/dish-photo-map.php             # which folder belongs to which item
 *   node web/scripts/build-dish-images.mjs     # this
 *
 * It lives under web/ rather than beside the PHP scripts because Node resolves
 * a bare import from the importing FILE's directory, and sharp is a web/
 * devDependency.
 *
 * WHY WEBP: DishImage requests /menu/{id}.webp first and only falls back to
 * .jpg when that 404s. Shipping JPEG alone would cost a wasted round trip per
 * dish on every menu view, which is worth avoiding on a phone.
 *
 * WHICH PHOTO: a folder holds camera originals (20260619_224913.jpg, often
 * duplicated as "(1)"), retouched studio deliverables named after the dish
 * ("Dal Makhani -1.png"), and — in some folders — AI-generated marketing images
 * named exactly like the retouched ones.
 *
 * So the choice is made on the BACKGROUND, not the filename: every genuine
 * studio frame is shot top-down on white, and every AI or lifestyle image sits
 * on a dark wooden table. A folder with no white-background frame is reported as
 * NO STUDIO SHOT rather than silently shipping something that will not match
 * the rest of the menu.
 */

import { readdirSync, statSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const PHOTO_ROOT = 'C:/Users/kulka/Downloads/Completed/STD';
const OUT_DIR = new URL('../public/menu/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MAP_FILE = new URL('../../scripts/dish-photo-map.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 800px covers every place the SPA shows a dish — list thumbnails and the
// larger home-page tiles — on a 2x screen, without shipping the full 1024.
const SIZE = 800;
const QUALITY = 80;
// Up to three photos per dish; matches DISH_PHOTO_SLOTS in includes/dish_photos.php.
const SLOTS = 3;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The retouched deliverables are named after the dish and numbered, but the
 * numbering is inconsistent across folders: "Dal Makhani -1", "Dal Fry-1",
 * "Matar Paneer 1". So strip a trailing separator-and-digits and require what
 * remains to BE the dish name.
 *
 * An exact comparison rather than word overlap, because overlap fails in both
 * directions: "Mix Veg Dry" has no word longer than three letters, and a folder
 * of stock imagery can share a word by accident.
 */
function isRetouched(file, folder, dishName) {
  const stem = basename(file, extname(file));
  if (!/[\s\-_]\d+$/.test(stem)) return false;

  // Some are indexed twice — "Aloo Matar 1 -1.png" — so strip every trailing
  // numeric token, not just the last one.
  let base = normalise(stem);
  while (/\s\d+$/.test(base)) base = base.replace(/\s\d+$/, '');
  if (base.length < 4) return false;

  // startsWith rather than equality, so "Aloo Matar" still claims the file in
  // the "Aloo Matar Dry" folder. Still strict enough to reject a folder's stock
  // imagery: "pomelli photoshoot image" is not the start of any dish name.
  return normalise(folder).startsWith(base) || normalise(dishName).startsWith(base);
}

/**
 * How close to white the four corners are.
 *
 * The genuine studio deliverables are all shot top-down on a white sweep. The
 * folders also contain AI-generated marketing images — styled bowls on wooden
 * tables, props, impossible steam, and in one case a hand with the wrong number
 * of fingers — and every one of those sits on a dark background. Corner
 * brightness separates the two cleanly, which naming alone does not: the AI
 * files are named after the dish and numbered exactly like the real ones.
 */
async function whiteness(file) {
  const { data, info } = await sharp(file).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  return (at(2, 2) + at(61, 2) + at(2, 61) + at(61, 61)) / 4;
}

const STUDIO_THRESHOLD = 225;

async function pickSource(folder, dishName) {
  const dir = join(PHOTO_ROOT, folder);
  const files = readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .filter((f) => !/\(\d+\)/.test(f)); // skip the "(1)" duplicates

  const candidates = [];
  for (const f of files) {
    const path = join(dir, f);
    candidates.push({
      f,
      path,
      retouched: isRetouched(f, folder, dishName),
      size: statSync(path).size,
      white: await whiteness(path),
    });
  }

  const byName = (a, b) => a.f.localeCompare(b.f, undefined, { numeric: true });

  /* SLOT 1 IS THE MENU TILE, so it gets the clean white-sweep frame. Every
     folder holds exactly one of those; the rest are the same dish restyled onto
     slate with props. Using a styled frame here would make the menu list look
     inconsistent dish to dish, which is the one place consistency matters most. */
  const white = candidates.filter((c) => c.white >= STUDIO_THRESHOLD).sort(byName);

  /* SLOTS 2 AND 3 are the styled frames, seen only after a customer taps. They
     are restricted to the retouched deliverables: camera originals are the
     photographer's unedited takes and would drag the gallery down, and stock
     imagery in a folder is not named after the dish so it never qualifies. */
  const styled = candidates.filter((c) => c.retouched && !white.includes(c)).sort(byName);

  if (white.length) {
    return [
      { file: white[0].path, kind: 'studio' },
      ...styled.slice(0, SLOTS - 1).map((c) => ({ file: c.path, kind: 'styled' })),
    ];
  }

  // No white frame at all. Fall back to the best available and say so — this one
  // will not match the others on the menu and is worth a second look.
  const rest = [...candidates].sort((a, b) => Number(b.retouched) - Number(a.retouched) || b.size - a.size);
  if (rest.length) return [{ file: rest[0].path, kind: 'NO STUDIO SHOT' }];

  return [];
}

const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
let totalBytes = 0;
const problems = [];

for (const [folder, { id, name }] of Object.entries(map)) {
  if (!existsSync(join(PHOTO_ROOT, folder))) {
    problems.push(`${folder}: folder is gone`);
    continue;
  }
  const sources = await pickSource(folder, name);
  if (!sources.length) {
    problems.push(`${folder}: no usable image`);
    continue;
  }

  const parts = [];
  for (const [i, src] of sources.entries()) {
    // Slot 1 keeps the bare filename, so every photo that already exists and
    // everything that reads them keeps working. Slots 2+ are suffixed.
    const slot = i + 1;
    const out = join(OUT_DIR, slot === 1 ? `${id}.webp` : `${id}-${slot}.webp`);
    const info = await sharp(src.file)
      // The retouched photos are already square; `cover` keeps that and
      // centre-crops anything that is not, which suits plated food from above.
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: QUALITY })
      .toFile(out);

    written++;
    totalBytes += info.size;
    parts.push(`${(info.size / 1024).toFixed(0)}KB`);
    if (src.kind === 'NO STUDIO SHOT') parts.push('NO STUDIO SHOT');
  }

  console.log(`  ${String(id).padEnd(4)} ${name.padEnd(30)} ${sources.length} photo(s)  ${parts.join(' ')}`);
}

/* Tell the SPA which dishes have a photo.
   The home page leads with pictures, and without this it would pick the first
   few simple items in menu order — mostly ones with no photo — and show empty
   fallback tiles while real photography sat unused. Generated rather than
   hand-listed so it cannot fall out of step with the files on disk. */
const ids = Object.values(map)
  .map((m) => m.id)
  .sort((a, b) => a - b);

const manifest = `// GENERATED by web/scripts/build-dish-images.mjs — do not edit.
// Menu item ids that have a photo in web/public/menu/.
export const DISH_PHOTO_IDS: ReadonlySet<number> = new Set([
${ids.map((id) => `  ${id},`).join('\n')}
]);
`;
const manifestPath = new URL('../src/apps/shared/lib/dishPhotos.ts', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
writeFileSync(manifestPath, manifest);

console.log(
  `\n${written} images -> web/public/menu/  (${(totalBytes / 1024 / 1024).toFixed(1)} MB total, ` +
    `avg ${(totalBytes / written / 1024).toFixed(0)} KB)`,
);
console.log(`manifest -> src/apps/shared/lib/dishPhotos.ts (${ids.length} ids)`);
if (problems.length) {
  console.log('\nproblems:');
  for (const p of problems) console.log(`  ${p}`);
}

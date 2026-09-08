/**
 * Drops the dish photos from a build destined for the Android app.
 *
 * WHY. In a native build the photo URLs carry the API origin (see
 * shared/lib/baseUrl.ts), so the app fetches every dish photo from the server —
 * exactly as the website does. The copies Vite puts in dist/menu are therefore
 * shipped inside the APK and never read: today that is 5.8 MB of an
 * otherwise ~1.5 MB app.
 *
 * The trade, stated plainly: bundled photos would render instantly and work
 * with no connection, server photos are always current and include anything
 * staff upload through the admin. Since there is now an uploader, current wins
 * — a bundled photo would go stale the first time someone replaced one.
 *
 * IT REFUSES WITHOUT AN ORIGIN. With no VITE_API_ORIGIN the app resolves
 * "/menu/…" against its own bundle, so removing the files would leave a build
 * with no photos at all and no way to fetch any. That is a silent, ugly
 * failure, so this stops instead.
 */

import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist/menu/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

if (!process.env.VITE_API_ORIGIN) {
  console.error(
    '\nstrip-bundled-photos: refusing to run without VITE_API_ORIGIN.\n' +
      'Without it the app looks for photos inside its own bundle, so removing\n' +
      'them would leave it with none. Build the app like this:\n\n' +
      '  VITE_API_ORIGIN=https://your-domain npm run build:app\n',
  );
  process.exit(1);
}

if (!existsSync(dir)) {
  console.log('strip-bundled-photos: nothing to remove (dist/menu is absent)');
  process.exit(0);
}

const files = readdirSync(dir);
const bytes = files.reduce((sum, f) => {
  const p = join(dir, f);
  return sum + (statSync(p).isFile() ? statSync(p).size : 0);
}, 0);

rmSync(dir, { recursive: true, force: true });

console.log(
  `strip-bundled-photos: removed ${files.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) — ` +
    `the app will load them from ${process.env.VITE_API_ORIGIN}/menu/`,
);

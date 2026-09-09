/**
 * Base URL helpers. The storefront deploys at the domain root (Vite base '/'),
 * so paths are plain. Kept as functions (mirroring the ERP) so a future
 * subdirectory deployment is a one-line change to vite.config base + here.
 *
 * Use apiUrl() for fetch, plain paths (/login) for React Router.
 */

function normalizeBase(base: string): string {
  if (!base || base === '/' || base === './') return '/';
  let n = base;
  if (!n.startsWith('/')) n = '/' + n;
  if (!n.endsWith('/')) n += '/';
  return n;
}

export function getBasePath(): string {
  const viteBase = (import.meta as any).env.BASE_URL as string | undefined;
  if (viteBase && viteBase !== '/' && viteBase !== './') return normalizeBase(viteBase);
  return '/';
}

export function getRouterBasename(): string {
  const base = getBasePath();
  return base === '/' ? '' : base.replace(/\/$/, '');
}

function join(base: string, ...segments: string[]): string {
  const parts = segments.map((s) => s.replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean);
  if (base === '/') return '/' + parts.join('/');
  return base.replace(/\/$/, '') + '/' + parts.join('/');
}

/**
 * Absolute origin of the API, for builds that are NOT served by the API host.
 *
 * The native shell serves this bundle from https://localhost, so a relative
 * /api/... would resolve to the bundle itself and every call would 404. Native
 * builds set VITE_API_ORIGIN to the real API host; the web build leaves it
 * unset and keeps the same-origin relative paths it has always used.
 *
 * Whatever host is set here must also appear in the API's CORS allowlist, and
 * the app's own origin (https://localhost) already does.
 */
const API_ORIGIN = (((import.meta as any).env.VITE_API_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '');

/** apiUrl('me') → /api/me  (or https://host/api/me in a native build) */
export function apiUrl(path: string): string {
  return API_ORIGIN + join(getBasePath(), 'api', path);
}

/**
 * A file served by the API host — dish photos, the branding logo.
 *
 * These need the same treatment as API calls and for the same reason, which is
 * easy to miss because they are plain <img> sources rather than fetches: in the
 * native app a bare "/menu/24.webp" resolves against https://localhost, which is
 * the bundle inside the APK, so it would show whatever was packaged at build
 * time and never a photo uploaded since.
 */
export function mediaUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return API_ORIGIN + (path.startsWith('/') ? path : '/' + path);
}

/** appUrl('login') → /login */
export function appUrl(path: string): string {
  return join(getBasePath(), path);
}

/**
 * An absolute URL fit to send to a customer — a claim link, a tracking link.
 *
 * window.location.origin is correct in a browser and WRONG in the app. The
 * native shell serves the bundle from https://localhost, so a link built from
 * the current origin arrives on the customer's phone as
 * "https://localhost/claim/..." — a dead link that looks like a broken
 * business. It went unnoticed because the browser admin, where origin IS the
 * public site, produces the right link.
 *
 * A native build carries the real host in VITE_API_ORIGIN, and that host is the
 * public site as well as the API, so prefer it and fall back to the current
 * origin on the web. Deliberately NOT settings.base_url: that value is
 * per-environment config and locally points at the retired PHP app on :8080,
 * which is exactly the trap push.php documents.
 */
export function publicUrl(path: string): string {
  const origin = API_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin + (path.startsWith('/') ? path : '/' + path);
}
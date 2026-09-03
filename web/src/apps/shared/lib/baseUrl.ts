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

/** appUrl('login') → /login */
export function appUrl(path: string): string {
  return join(getBasePath(), path);
}
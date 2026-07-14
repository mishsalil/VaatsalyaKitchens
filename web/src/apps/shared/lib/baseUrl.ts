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

/** apiUrl('me') → /api/me */
export function apiUrl(path: string): string {
  return join(getBasePath(), 'api', path);
}

/** appUrl('login') → /login */
export function appUrl(path: string): string {
  return join(getBasePath(), path);
}
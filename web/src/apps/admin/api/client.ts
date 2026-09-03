import { apiUrl } from '../../shared/lib/baseUrl';

/**
 * Admin API client — isolated from the customer client because the admin uses a
 * SEPARATE session (VKADMIN cookie) with its own CSRF token. The customer
 * AuthProvider would overwrite a shared token store, so admin keeps its own.
 *
 * Endpoints live under /api/admin/*; this client prefixes `admin/` so callers
 * use the same short names as the customer API (e.g. adminApi.get('orders')).
 *
 * The CSRF token is bootstrapped from GET /api/admin/me by AdminAuthProvider and
 * injected on mutating requests via X-CSRF-Token. On a 403 CSRF error we refresh
 * from /api/admin/me and retry once.
 */
let adminCsrf: string | null = null;

export function setAdminCsrfToken(token: string | null): void {
  adminCsrf = token;
}

export function getAdminCsrfToken(): string | null {
  return adminCsrf;
}

/**
 * Admin bearer token (phase 3), in its own localStorage slot for the same
 * reason this whole client is separate: the customer app must not overwrite it.
 * Staff and customer sessions stay independent, as the two cookies always were.
 */
const ADMIN_TOKEN_KEY = 'vk_admin_token';

function readStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

let adminToken: string | null = readStoredAdminToken();

export function setAdminAuthToken(token: string | null): void {
  adminToken = token;
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* in-memory token still works for this session */
  }
}

export function getAdminAuthToken(): string | null {
  return adminToken;
}

/** Headers every admin request carries, bearer included. */
function authHeaders(): Record<string, string> {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}

function isMutating(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

async function refreshAdminCsrf(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('admin/me'), { credentials: 'include', headers: authHeaders() });
    const data = await res.json();
    adminCsrf = data.csrf_token ?? null;
    return adminCsrf;
  } catch {
    return null;
  }
}

function adminUrl(endpoint: string): string {
  return apiUrl('admin/' + endpoint.replace(/^\/+/, ''));
}

async function request(method: string, endpoint: string, body?: object | FormData): Promise<any> {
  const url = adminUrl(endpoint);
  const options: RequestInit = { method, credentials: 'include', headers: {} };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  }

  Object.assign(options.headers as Record<string, string>, authHeaders());

  if (isMutating(method) && adminCsrf) {
    (options.headers as Record<string, string>)['X-CSRF-Token'] = adminCsrf;
  }

  let res = await fetch(url, options);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() || `Request failed: ${res.status} ${res.statusText}` };
  }

  if (res.status === 403 && isMutating(method) && (data?.error || '').toLowerCase().includes('csrf')) {
    const fresh = await refreshAdminCsrf();
    if (fresh) {
      (options.headers as Record<string, string>)['X-CSRF-Token'] = fresh;
      res = await fetch(url, options);
      const text2 = await res.text();
      try {
        data = JSON.parse(text2);
      } catch {
        data = { error: text2.trim() || `Request failed: ${res.status} ${res.statusText}` };
      }
    }
  }

  /* Dead token — drop it, or it would out-rank the VKADMIN cookie forever.
     See the customer client for the full reasoning. */
  if (res.status === 401 && adminToken) {
    setAdminAuthToken(null);
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status} ${res.statusText}`);
  }
  return data;
}

export const adminApi = {
  get: (endpoint: string) => request('GET', endpoint),
  post: (endpoint: string, body?: object | FormData) => request('POST', endpoint, body),
  put: (endpoint: string, body?: object) => request('PUT', endpoint, body),
  patch: (endpoint: string, body?: object) => request('PATCH', endpoint, body),
  delete: (endpoint: string) => request('DELETE', endpoint),
  /** GET a binary/CSV response as a Blob (bypasses JSON parsing). Used by CSV export. */
  csvGet: async (endpoint: string): Promise<Blob> => {
    const res = await fetch(adminUrl(endpoint), { credentials: 'include', headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = text.trim() || `Request failed: ${res.status} ${res.statusText}`;
      try {
        msg = JSON.parse(text).error || msg;
      } catch {
        /* keep text message */
      }
      throw new Error(msg);
    }
    return res.blob();
  },
};
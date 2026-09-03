import { apiUrl } from '../lib/baseUrl';

/**
 * CSRF token is delivered by GET /api/me (the SPA has no server-rendered meta
 * tag). AuthProvider stores it here on mount; mutating requests inject it via
 * the X-CSRF-Token header. On a 403, we refresh the token from /api/me and
 * retry the request once — handles the "session rotated after logout" case.
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/**
 * Bearer token (phase 3). Persisted in localStorage so a reload stays signed in
 * without relying on a cookie — which is the whole point: the native WebView
 * serves the app from https://localhost, making the session cookie cross-site
 * and therefore never sent.
 *
 * Every access is wrapped: localStorage throws outright in some privacy modes,
 * and a storage failure must degrade to "signed out", never to a crash.
 *
 * The admin app keeps its own separate slot, mirroring the independent VKADMIN
 * and PHPSESSID cookies, so a rep can be signed in as staff and as a customer
 * at the same time.
 */
const TOKEN_KEY = 'vk_token';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let authToken: string | null = readStoredToken();

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* in-memory token still works for this session */
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

function isMutating(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

async function refreshCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('me'), {
      credentials: 'include',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    const data = await res.json();
    csrfToken = data.csrf_token ?? null;
    return csrfToken;
  } catch {
    return null;
  }
}

async function request(method: string, endpoint: string, body?: object | FormData): Promise<any> {
  const url = apiUrl(endpoint);
  const options: RequestInit = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  }

  if (authToken) {
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  if (isMutating(method)) {
    if (csrfToken) (options.headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
  }

  let res = await fetch(url, options);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() || `Request failed: ${res.status} ${res.statusText}` };
  }

  // Token expired/rotated — refresh and retry once.
  if (res.status === 403 && isMutating(method) && (data?.error || '').toLowerCase().includes('csrf')) {
    const fresh = await refreshCsrfToken();
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

  /* A 401 while holding a token means the token is dead — expired, revoked, or
     issued to a customer who no longer exists. Drop it. The server treats a
     present token as authoritative, so keeping a dead one would out-rank the
     session cookie and lock the app out permanently instead of just signing
     the user out once. */
  if (res.status === 401 && authToken) {
    setAuthToken(null);
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status} ${res.statusText}`);
  }
  return data;
}

export const api = {
  get: (endpoint: string) => request('GET', endpoint),
  post: (endpoint: string, body?: object) => request('POST', endpoint, body),
  put: (endpoint: string, body?: object) => request('PUT', endpoint, body),
  patch: (endpoint: string, body?: object) => request('PATCH', endpoint, body),
  delete: (endpoint: string) => request('DELETE', endpoint),
};
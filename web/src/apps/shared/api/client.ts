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

function isMutating(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

async function refreshCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('me'), { credentials: 'include' });
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
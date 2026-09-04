import { apiUrl } from '../../shared/lib/baseUrl';

/**
 * Admin API client — isolated from the customer client because staff and
 * customer credentials are independent: a rep can be signed in as both at once,
 * exactly as the separate VKADMIN and PHPSESSID cookies used to allow. Its token
 * therefore lives in its own storage slot, which the customer app never touches.
 *
 * Endpoints live under /api/admin/*; this client prefixes `admin/` so callers
 * use the same short names as the customer API (e.g. adminApi.get('orders')).
 *
 * Authentication is a bearer token and nothing else — see the customer client
 * for why no CSRF token is needed once the credential is not ambient.
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

/** Headers every admin request carries. */
function authHeaders(): Record<string, string> {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}

function adminUrl(endpoint: string): string {
  return apiUrl('admin/' + endpoint.replace(/^\/+/, ''));
}

async function request(method: string, endpoint: string, body?: object | FormData): Promise<any> {
  const url = adminUrl(endpoint);
  const headers: Record<string, string> = { ...authHeaders() };
  const options: RequestInit = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data: any;
  let parsed = true;
  try {
    data = JSON.parse(text);
  } catch {
    parsed = false;
  }

  /* Dead token — drop it so the app lands on the sign-in screen rather than
     retrying a credential that cannot work. */
  if (res.status === 401 && adminToken) {
    setAdminAuthToken(null);
  }

  /* Not JSON means the request never reached a route handler — a PHP fatal is
     served as HTML with status 200. Treating that as success hands the caller
     an object with none of the fields it expects, which surfaces as an empty
     screen rather than an error. See the customer client for the full note.
     The body is logged, not shown: it can carry absolute server paths. */
  if (!parsed) {
    console.error('[admin api] non-JSON response', res.status, url, text.slice(0, 500));
    throw new Error(
      res.ok
        ? 'Something went wrong at our end. Please try again in a moment.'
        : `Request failed: ${res.status} ${res.statusText}`,
    );
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
    const res = await fetch(adminUrl(endpoint), { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Only surface a server message when it is a JSON error envelope; a raw
      // body here can be an HTML fatal carrying absolute server paths.
      let msg = `Request failed: ${res.status} ${res.statusText}`;
      try {
        msg = JSON.parse(text).error || msg;
      } catch {
        /* keep the status message */
      }
      throw new Error(msg);
    }

    /* A 200 is not enough: a PHP fatal is HTML with status 200, and without
       this the export would "succeed" and hand the user a .csv containing an
       error page. Content-Disposition is what the export route sets. */
    const type = res.headers.get('Content-Type') || '';
    if (type.includes('text/html')) {
      console.error('[admin api] export returned HTML instead of CSV', adminUrl(endpoint));
      throw new Error('The export could not be generated. Please try again in a moment.');
    }
    return res.blob();
  },
};

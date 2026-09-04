import { apiUrl } from '../lib/baseUrl';
import { mirrorAuthToken } from '../lib/tokenMirror';

/**
 * Customer API client. Authentication is a bearer token, nothing else.
 *
 * The token is persisted in localStorage so a reload stays signed in without a
 * cookie — which is the point: the native WebView serves the app from
 * https://localhost, so a SameSite=Lax session cookie would never be sent.
 *
 * There is no CSRF token here any more, and that is not an omission. CSRF
 * existed because browsers attach cookies to cross-site requests by themselves,
 * letting a hostile page spend the victim's ambient credential. Nothing attaches
 * an Authorization header on its own, so there is no forgery to prevent. The
 * request is not sent with credentials at all, so no cookie rides along.
 *
 * Every storage access is wrapped: localStorage throws outright in some privacy
 * modes, and a storage failure must degrade to "signed out", never to a crash.
 *
 * The admin app keeps its own separate slot, mirroring what the independent
 * VKADMIN and PHPSESSID cookies used to give: a rep can be signed in as staff
 * and as a customer at the same time.
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

/* Keep the service worker's copy in step from the very first load, not only on
   sign-in: a device that signed in before this mirror existed would otherwise
   never write one, and its rotated subscriptions would keep landing against
   nobody. Writing the same value twice is harmless. */
void mirrorAuthToken(authToken);

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* in-memory token still works for this session */
  }
  /* The service worker cannot read localStorage, so it reads this instead when
     the browser rotates a push subscription. Fire-and-forget: the app never
     reads the mirror back, and a storage failure must not break signing in. */
  void mirrorAuthToken(token);
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request(method: string, endpoint: string, body?: object | FormData): Promise<any> {
  const url = apiUrl(endpoint);
  const headers: Record<string, string> = {};
  const options: RequestInit = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url, options);
  const text = await res.text();
  let data: any;
  let parsed = true;
  try {
    data = JSON.parse(text);
  } catch {
    parsed = false;
  }

  /* A 401 while holding a token means the token is dead — expired, revoked, or
     issued to someone who no longer exists. Drop it, so the app returns to a
     clean signed-out state instead of retrying a credential that cannot work. */
  if (res.status === 401 && authToken) {
    setAuthToken(null);
  }

  /* A body that is not JSON is a failure however the status reads.
     This API answers JSON on every path, so anything else means the request
     never reached a route handler — a PHP fatal, which is emitted as HTML with
     status 200, or a proxy or captive portal answering instead. Treating that
     as success is what once rendered a whole menu as an empty page with no
     error at all, because `data.items` was simply undefined.

     The raw body is logged, never shown: a PHP fatal includes absolute server
     paths, and a customer should not be reading those. */
  if (!parsed) {
    console.error('[api] non-JSON response', res.status, url, text.slice(0, 500));
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

export const api = {
  get: (endpoint: string) => request('GET', endpoint),
  post: (endpoint: string, body?: object) => request('POST', endpoint, body),
  put: (endpoint: string, body?: object) => request('PUT', endpoint, body),
  patch: (endpoint: string, body?: object) => request('PATCH', endpoint, body),
  delete: (endpoint: string) => request('DELETE', endpoint),
};

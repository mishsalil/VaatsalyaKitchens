import { apiUrl } from '../lib/baseUrl';

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
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() || `Request failed: ${res.status} ${res.statusText}` };
  }

  /* A 401 while holding a token means the token is dead — expired, revoked, or
     issued to someone who no longer exists. Drop it, so the app returns to a
     clean signed-out state instead of retrying a credential that cannot work. */
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

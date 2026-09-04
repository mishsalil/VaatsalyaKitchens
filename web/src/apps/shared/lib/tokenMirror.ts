/**
 * Mirrors the customer's bearer token into IndexedDB for the service worker.
 *
 * WHY THIS EXISTS
 * The service worker re-registers a push subscription when the browser rotates
 * it (`pushsubscriptionchange`), and that request has to say WHO the device
 * belongs to. It used to say so with the session cookie. Cookies are gone, and
 * a service worker cannot read localStorage — it has no window — so without a
 * copy it can reach somewhere the token is visible, the rotated subscription
 * lands against nobody and that customer silently stops being reachable until
 * they next open the app.
 *
 * WHY THIS IS NOT A NEW EXPOSURE
 * IndexedDB and localStorage sit behind the same boundary: same origin, both
 * readable by any script on the page. Anything that could read one could
 * already read the other, so this duplicates the token without widening who
 * can see it.
 *
 * Every operation is best-effort. Storage throws outright in some privacy
 * modes, and a mirror that fails must cost nothing more than the old
 * behaviour — the app itself never reads this copy.
 */

const DB_NAME = 'vk-auth';
const DB_VERSION = 1;
const STORE = 'auth';
/** Must match the key sw.js reads. */
const KEY = 'customer_token';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Write or clear the mirrored token. Never rejects. */
export async function mirrorAuthToken(token: string | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (token) store.put(token, KEY);
      else store.delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* best effort */
  } finally {
    db.close();
  }
}

/** Read it back. Only used by tests and diagnostics; the app reads localStorage. */
export async function readMirroredAuthToken(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

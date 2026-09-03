import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Native (FCM) push registration, for the Android shell only.
 *
 * WHY A SEPARATE MODULE FROM PushManager
 * PushManager owns Web Push: a service worker, a VAPID key, a PushSubscription.
 * None of that exists in the app — an installed Android app has no browser
 * holding a push connection on its behalf, so it registers with Google Play
 * services instead and gets an FCM token. Same intent, entirely different
 * machinery, so entangling the two would leave every method with a branch.
 *
 * The browser keeps using Web Push exactly as before; this path only runs when
 * Capacitor reports a native platform.
 */

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;   // the web build never loads the native bridge
  }
}

/** How long to wait for FCM to hand back a token before giving up. */
const REGISTRATION_TIMEOUT_MS = 15000;

/* Registration is a singleton. The provider effect re-runs when settings
   arrive, and React StrictMode double-invokes it in development, so a plain
   call would register three times over — each one adding another pair of
   listeners that never get removed and firing another register(). Memoising
   the promise makes repeat calls free and hand back the same token. */
let registration: Promise<string | null> | null = null;
let handlersAttached = false;

/**
 * Ask for notification permission and register with FCM.
 * Resolves with the FCM token, or null if unavailable, refused, or too slow.
 *
 * Never rejects: push failing must not take the app down with it.
 */
export function registerNativePush(): Promise<string | null> {
  registration ??= doRegister();
  return registration;
}

async function doRegister(): Promise<string | null> {
  if (!isNativePlatform()) return null;

  try {
    let status = await PushNotifications.checkPermissions();

    // POST_NOTIFICATIONS is a runtime permission from Android 13; before that
    // the check already reports granted.
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') return null;

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };

      /* Registration is event-driven: register() only starts it, and the token
         arrives later on a listener. A device with no Play services, or no
         network, simply never fires either event — hence the timeout, so a
         caller is never left awaiting a promise that cannot settle. */
      const timer = setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);

      PushNotifications.addListener('registration', (token) => {
        clearTimeout(timer);
        // Logged by prefix only: the token identifies this install, and a full
        // one in a production log is a needless leak. Logged here rather than at
        // the call site so it reflects real registrations, not repeat awaits of
        // the memoised promise.
        console.info('[push] FCM token acquired', token.value.slice(0, 12) + '…', 'length', token.value.length);
        finish(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timer);
        console.warn('[push] FCM registration failed', err);
        finish(null);
      });

      void PushNotifications.register();
    });
  } catch (e) {
    console.warn('[push] native registration unavailable', e);
    return null;
  }
}

/**
 * Route a tapped notification to the page it refers to.
 *
 * The payload carries the same `url` the web service worker uses, so the
 * server sends one shape for both transports. Navigation is a hard location
 * change rather than a router push because the tap can arrive while the app is
 * cold, before any router exists.
 */
export function attachNativePushHandlers(): void {
  if (!isNativePlatform() || handlersAttached) return;
  handlersAttached = true;

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = (action.notification?.data as Record<string, unknown> | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      window.location.assign(url);
    }
  });
}

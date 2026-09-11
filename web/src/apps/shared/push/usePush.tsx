import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { pushManager, type PushPermission, type PushState } from './PushManager';
import { isNativePlatform, registerNativePush, attachNativePushHandlers } from './nativePush';
import { useAuth } from '../hooks/useAuth';
import { pushApi } from '../api/endpoints';

interface PushContextValue {
  /** Running inside the Android shell, where push is FCM rather than Web Push. */
  native: boolean;
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
  /** Silent best-effort subscribe (no prompt). Returns true if subscribed. */
  ensure: () => Promise<boolean>;
  /** Ask the browser for permission (call from a click). */
  requestPermission: () => Promise<PushPermission>;
  /** Forget this device's subscription. */
  unsubscribe: () => Promise<void>;
  /** Dismiss the current nudge for this surface this session. */
  dismiss: (surface: PushSurface) => void;
  /** Has the user dismissed the nudge on a given surface this session? */
  isDismissed: (surface: PushSurface) => boolean;
}

export type PushSurface = 'home' | 'order' | 'success' | 'account' | 'claim';

const DISMISS_KEY = 'vk-push-dismissed';

const PushContext = createContext<PushContextValue | undefined>(undefined);

export function PushProvider({ children }: { children: ReactNode }) {
  const { user, settings } = useAuth();
  const [state, setState] = useState(() => pushManager.getState());
  const [dismissed, setDismissed] = useState<PushSurface[]>(() => readDismissed());

  // Web Push: initialize the SW the moment settings (VAPID key) arrive, then
  // make a silent best-effort subscription attempt on site open. The Android
  // shell skips all of this — it has no service worker and no use for a VAPID
  // key — and takes the FCM path in the effect below.
  useEffect(() => {
    if (isNativePlatform()) return;   // the app has no service worker to init
    if (!settings?.vapid_public_key || !settings.push_configured) return;
    pushManager.init(settings.vapid_public_key).then(() => pushManager.ensureSubscribed());
  }, [settings?.vapid_public_key, settings?.push_configured]);

  /* Native registration, keyed on WHO is signed in rather than on settings.
     Registration itself memoises, so the token is fetched once per launch, but
     it must be re-sent when the customer changes: a guest registers with
     customer_id NULL, and without this the device would still be nobody's after
     they signed in — reachable about nothing. Signing out re-sends it as a
     guest again, which is what should happen on a shared device. */
  /* In the app, the state the UI shows comes from the FCM registration, not
     from the Web Push detector — which is false in a WebView (no service
     worker, no PushManager) and used to make the account page tell a
     subscribed customer that push was "not supported by your browser". A
     token means on; a refused permission means blocked. */
  const [nativeState, setNativeState] = useState<PushState | null>(null);
  useEffect(() => {
    if (!isNativePlatform()) return;
    attachNativePushHandlers();
    registerNativePush().then((token) => {
      setNativeState({ supported: true, permission: token ? 'granted' : 'denied', subscribed: !!token });
      if (!token) return;
      // Best-effort: a device that cannot register still uses the app fine.
      pushApi.registerFcm(token).catch(() => {});
    });
  }, [user?.id]);

  useEffect(() => pushManager.subscribe(setState), []);

  const native = isNativePlatform();
  const shown: PushState = native
    ? (nativeState ?? { supported: true, permission: 'default', subscribed: false })
    : state;

  const ensure = useCallback(() => pushManager.ensureSubscribed(), []);
  const requestPermission = useCallback(() => pushManager.requestPermission(), []);
  const unsubscribe = useCallback(() => pushManager.unsubscribe(), []);

  const dismiss = useCallback((surface: PushSurface) => {
    setDismissed((prev) => {
      if (prev.includes(surface)) return prev;
      const next = [...prev, surface];
      try {
        sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const isDismissed = useCallback((surface: PushSurface) => dismissed.includes(surface), [dismissed]);

  return (
    <PushContext.Provider
      value={{
        native,
        supported: shown.supported,
        permission: shown.permission,
        subscribed: shown.subscribed,
        ensure,
        requestPermission,
        unsubscribe,
        dismiss,
        isDismissed,
      }}
    >
      {children}
    </PushContext.Provider>
  );
}

function readDismissed(): PushSurface[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usePush(): PushContextValue {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush must be used within PushProvider');
  return ctx;
}
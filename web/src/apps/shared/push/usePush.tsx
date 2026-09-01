import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { pushManager, type PushPermission } from './PushManager';
import { useAuth } from '../hooks/useAuth';

interface PushContextValue {
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
  const { settings } = useAuth();
  const [state, setState] = useState(() => pushManager.getState());
  const [dismissed, setDismissed] = useState<PushSurface[]>(() => readDismissed());

  // Initialize the SW + push the moment settings (VAPID key) arrive, then make
  // a silent best-effort subscription attempt on site open.
  useEffect(() => {
    if (!settings?.vapid_public_key || !settings.push_configured) return;
    pushManager.init(settings.vapid_public_key).then(() => pushManager.ensureSubscribed());
  }, [settings?.vapid_public_key, settings?.push_configured]);

  useEffect(() => pushManager.subscribe(setState), []);

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
        supported: state.supported,
        permission: state.permission,
        subscribed: state.subscribed,
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
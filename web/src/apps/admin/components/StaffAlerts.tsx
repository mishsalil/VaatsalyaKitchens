import { useEffect, useRef, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { usePush } from '../../shared/push/usePush';
import { pushManager } from '../../shared/push/PushManager';
import { isNativePlatform, registerNativePush } from '../../shared/push/nativePush';
import { adminPushApi } from '../api/endpoints';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../../shared/context/ToastContext';

/**
 * Kitchen alerts for THIS device, registered against the signed-in admin so
 * push_send_to_admins() can reach the counter.
 *
 * Staff devices register by DEFAULT: whenever an admin is signed in and the
 * browser has already granted notifications, the subscription is (re)posted
 * silently on every load — no button to find, and it re-binds automatically
 * when a different staff account signs in on a shared counter device.
 *
 * What cannot be automatic is the permission itself: browsers require a user
 * gesture to grant it, so when permission has never been asked for, this
 * renders an unmissable banner instead of a quiet link. A kitchen relying on
 * cancellation alerts must never be silently unsubscribed — which is exactly
 * what the earlier opt-in link caused.
 */
export function StaffAlerts({ variant = 'sidebar' }: { variant?: 'sidebar' | 'banner' }) {
  const { supported, permission, requestPermission } = usePush();
  const { admin } = useAdminAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const attempted = useRef<string | null>(null);

  /* The Android app registers its FCM token instead of a browser subscription:
     it has no service worker, and `supported`/`permission` describe Web Push,
     which does not exist there. Keyed by admin id for the same reason as below
     — a shared counter phone must re-bind to whoever is on shift now.

     This only ever sets admin_id server-side; it never clears customer_id, so a
     rep signing in at the counter does not stop their own customer
     notifications on the same phone. */
  useEffect(() => {
    if (!isNativePlatform() || !admin) return;
    registerNativePush().then((token) => {
      if (!token) return;
      adminPushApi
        .registerFcm(token)
        .then(() => setRegistered(true))
        .catch(() => {
          /* silent — the banner below covers the visible failure modes */
        });
    });
  }, [admin?.id]);

  // Auto-register whenever permission already exists. Keyed by admin id so a
  // shared device re-binds to whoever is signed in now.
  useEffect(() => {
    if (isNativePlatform()) return;   // handled by the FCM effect above
    if (!supported || !admin || permission !== 'granted') return;
    const key = String(admin.id);
    if (attempted.current === key) return;
    attempted.current = key;
    (async () => {
      try {
        const sub = await pushManager.ensureBrowserSubscription();
        if (!sub) return;
        await adminPushApi.subscribe(sub.toJSON());
        setRegistered(true);
      } catch {
        /* silent — the banner below covers the visible failure modes */
      }
    })();
  }, [supported, admin, permission]);

  if (!admin) return null;

  /* On Android the Web Push signals below are meaningless — the WebView may
     well report serviceWorker and PushManager as present while `permission`
     stays 'default', which would show staff an "enable alerts" banner for a
     device that is already registered with FCM. So the app reports only the
     state the FCM effect actually established, and never offers the browser
     permission flow, which cannot help it. */
  if (isNativePlatform()) {
    if (!registered || variant !== 'sidebar') return null;
    return (
      <p className="flex items-center gap-1.5 px-3 text-[11px] font-medium text-emerald-600">
        <BellRing className="h-3.5 w-3.5" /> Alerts on
      </p>
    );
  }

  if (!supported) return null;
  if (permission === 'granted' && registered) {
    return variant === 'sidebar' ? (
      <p className="flex items-center gap-1.5 px-3 text-[11px] font-medium text-emerald-600">
        <BellRing className="h-3.5 w-3.5" /> Alerts on
      </p>
    ) : null;
  }

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await requestPermission();
      if (perm !== 'granted') {
        toast.error('Notifications are blocked for this site. Enable them in your browser settings.');
        return;
      }
      const sub = await pushManager.ensureBrowserSubscription();
      if (!sub) {
        toast.error('Could not set up notifications on this device.');
        return;
      }
      await adminPushApi.subscribe(sub.toJSON());
      setRegistered(true);
      toast.info('This device will now be alerted about cancellations.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Blocked at the browser level — no button can fix this, so say what will.
  if (permission === 'denied') {
    if (variant === 'sidebar') return null;
    return (
      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-gold-300 bg-gold-50 p-4 text-gold-900">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">
          <span className="font-bold">Cancellation alerts are blocked on this device.</span>{' '}
          Notifications are turned off for this site in your browser settings — until they are
          re-enabled, this device will only see cancellations on the board below.
        </p>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-cream-100 hover:text-brand-900 disabled:opacity-60"
      >
        <BellRing className="h-4 w-4" /> {busy ? 'Setting up…' : 'Turn on alerts'}
      </button>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-300 bg-brand-50 p-4">
      <BellRing className="h-5 w-5 shrink-0 text-brand-700" />
      <p className="min-w-0 flex-1 text-sm text-brand-800">
        <span className="font-bold">Cancellation alerts are off on this device.</span>{' '}
        Turn them on so you hear about a cancellation without watching this screen.
      </p>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-brand-800 disabled:opacity-60"
      >
        {busy ? 'Setting up…' : 'Turn on alerts'}
      </button>
    </div>
  );
}

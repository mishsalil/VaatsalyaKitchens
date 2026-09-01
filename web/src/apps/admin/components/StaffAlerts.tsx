import { useState } from 'react';
import { BellRing, Check } from 'lucide-react';
import { usePush } from '../../shared/push/usePush';
import { pushManager } from '../../shared/push/PushManager';
import { adminPushApi } from '../api/endpoints';
import { useToast } from '../../shared/context/ToastContext';

/**
 * Register THIS device for kitchen alerts (migration_008).
 *
 * Deliberately separate from the customer PushNudge: the browser subscription
 * is the same, but it is registered against the signed-in admin so
 * push_send_to_admins() can reach the counter. A rep's phone is often also
 * their own customer device, and the two registrations are kept independent so
 * neither overwrites the other.
 */
export function StaffAlerts() {
  const { supported, permission, requestPermission } = usePush();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!supported) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const perm = permission === 'granted' ? 'granted' : await requestPermission();
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
      setDone(true);
      toast.info('This device will now be alerted about cancellations.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="flex items-center gap-1.5 px-3 text-xs font-medium text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Alerts on for this device
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-cream-100 hover:text-brand-900 disabled:opacity-60"
    >
      <BellRing className="h-4 w-4" /> {busy ? 'Setting up…' : 'Alerts on this device'}
    </button>
  );
}

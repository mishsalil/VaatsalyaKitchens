import { useState, useEffect } from 'react';
import { Bell, BellRing, X, CheckCircle2 } from 'lucide-react';
import { usePush, type PushSurface } from './usePush';

interface Props {
  surface: PushSurface;
  /** Compact banner vs. full card. */
  variant?: 'card' | 'compact';
}

const COPY: Record<PushSurface, { title: string; body: string }> = {
  home: {
    title: 'Stay in the know about your orders',
    body: 'Get a gentle ping the moment your order is confirmed, starts being prepared, and is out for delivery — no app needed, and you can switch it off anytime.',
  },
  order: {
    title: 'Let us notify you while you wait',
    body: 'Once you place this order we will tell you when it is confirmed and on its way. Turn on notifications now so you do not have to keep checking.',
  },
  success: {
    title: 'Get updates about this order',
    body: 'We will notify you right on this device when your order is confirmed and when it is on its way — no app needed.',
  },
  account: {
    title: 'Order updates, straight to this device',
    body: 'Never miss a confirmation or "out for delivery" update. You can switch notifications off anytime from your browser settings.',
  },
  // Right after a counter order's claim link is opened — the customer has just
  // arrived on their own phone with a live order, so this is the one moment
  // notifications are obviously worth having.
  claim: {
    title: 'Want updates on this order?',
    body: 'We will ping this phone when your order is being prepared and when it is on its way — no app needed, and you can switch it off anytime.',
  },
};

/**
 * Dismissible push opt-in card, surfaced at several points (home, order,
 * success, account). It reappears at each new surface even if dismissed
 * elsewhere, so it stays gently inevitable without being intrusive. If
 * permission is already granted but the subscription dropped, it silently
 * re-subscribes. When the user has blocked notifications, it steps aside.
 */
export function PushNudge({ surface, variant = 'card' }: Props) {
  const { supported, permission, subscribed, requestPermission, ensure, dismiss, isDismissed } = usePush();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'granted' | 'denied' | null>(null);

  // If permission was granted earlier but we're not subscribed yet, fix it
  // silently (idempotent). MUST be before any early return — hooks can't be
  // conditional, or the hook order changes between renders and React crashes.
  useEffect(() => {
    if (supported && permission === 'granted' && !subscribed && !busy) {
      ensure().catch(() => {});
    }
  }, [supported, permission, subscribed, busy, ensure]);

  if (!supported) return null;
  // Blocked by the browser — nothing we can do here; account page shows guidance.
  if (permission === 'denied') return null;
  // Already subscribed and confirmed — nothing to ask for.
  if (permission === 'granted' && subscribed) return null;
  if (isDismissed(surface)) return null;

  const { title, body } = COPY[surface];

  const enable = async () => {
    setBusy(true);
    const perm = await requestPermission();
    setBusy(false);
    if (perm === 'granted') {
      setOutcome('granted');
    } else if (perm === 'denied') {
      setOutcome('denied');
    }
  };

  if (outcome === 'granted') {
    return (
      <div className={`flex items-center gap-3 ${variant === 'card' ? 'rounded-xl border border-green-200 bg-green-50 p-4' : 'rounded-lg bg-green-50 p-3'} text-green-800`}>
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">Notifications on — we will ping you about your orders on this device.</p>
      </div>
    );
  }

  if (outcome === 'denied') {
    return (
      <div className="rounded-xl border border-gold-200 bg-gold-50 p-4 text-gold-800">
        <p className="text-sm">No problem — we will keep you updated by phone. You can turn notifications on later from your browser settings.</p>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl border border-cream-200 bg-white shadow-card ${variant === 'card' ? 'p-5' : 'p-4'}`}>
      <button
        type="button"
        onClick={() => dismiss(surface)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-full p-1 text-brand-300 transition-colors hover:bg-cream-100 hover:text-brand-700"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
          <BellRing className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
          <p className="mt-1 text-sm text-brand-600">{body}</p>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-cream-50 transition-all hover:bg-brand-800 hover:shadow-lift disabled:opacity-60"
          >
            <Bell className="h-4 w-4" />
            {busy ? 'Setting up…' : 'Yes, notify me'}
          </button>
        </div>
      </div>
    </div>
  );
}
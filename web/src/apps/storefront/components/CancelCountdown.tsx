import { useEffect, useState } from 'react';
import { XCircle, Clock } from 'lucide-react';
import { ordersApi } from '../../shared/api/endpoints';
import { useToast } from '../../shared/context/ToastContext';

/**
 * "Changed your mind?" — a live countdown giving the customer a short window to
 * cancel their own order, after which they call the kitchen instead.
 *
 * The clock here is only UX. `secondsLeft` comes from the server (computed from
 * orders.created_at) and the cancel endpoint re-checks the window on every
 * request, so a paused tab, a slow render or a tampered client clock cannot buy
 * extra time. When it reaches zero the control disappears on its own.
 */
export function CancelCountdown({
  orderId,
  secondsLeft,
  requestedAt,
  onCancelled,
}: {
  orderId: number;
  secondsLeft: number;
  /** Set once the request is in with the kitchen and awaiting confirmation. */
  requestedAt?: string | null;
  onCancelled?: () => void;
}) {
  const toast = useToast();
  const [left, setLeft] = useState(secondsLeft);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Re-sync whenever the parent refetches, then tick locally between fetches.
  useEffect(() => setLeft(secondsLeft), [secondsLeft]);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Request already in: the customer is waiting on the kitchen, and the order is
     deliberately NOT shown as cancelled yet — it may still be cooking. */
  if (requestedAt) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-gold-200 bg-gold-50 p-3 text-gold-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">
          <span className="font-semibold">Cancellation requested.</span> We have sent this to the
          kitchen — we will confirm shortly. Your order is not cancelled until then.
        </p>
      </div>
    );
  }

  if (left <= 0) return null;

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  const cancel = async () => {
    setBusy(true);
    try {
      await ordersApi.cancel(orderId);
      toast.info('Cancellation request sent to the kitchen. We will confirm shortly.');
      onCancelled?.();
    } catch (e) {
      // Almost always "the window has passed" — the server is the authority.
      toast.error((e as Error).message);
      setLeft(0);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-xl border border-cream-300 bg-cream-50 p-3">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-brand-700">Ask the kitchen to cancel this order?</p>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Yes, request it'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
          >
            Keep it
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-brand-700">
            Changed your mind? You can cancel for{' '}
            <span className="font-semibold tabular-nums text-brand-900">{mmss}</span>.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
          >
            <XCircle className="h-3.5 w-3.5" /> Request cancellation
          </button>
        </div>
      )}
    </div>
  );
}

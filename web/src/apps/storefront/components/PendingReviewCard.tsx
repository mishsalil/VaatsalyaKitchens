import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { accountApi } from '../../shared/api/endpoints';

/**
 * Prompts a signed-in customer to rate their last order.
 *
 * Renders nothing at all when there is nothing due, and swallows its own
 * errors: a failed request here must never disturb the page it sits on.
 *
 * No token is minted just by this card being on screen — GET pending-review
 * only says whether an order is due. A token is minted on tap (POST
 * review-link), because this mounts on both Home and MyAccount and minting on
 * render would insert an unbounded, unpruned review_tokens row per page view.
 */
export function PendingReviewCard() {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    accountApi.pendingReview()
      .then((d) => {
        if (!cancelled && d.order_id) setOrderId(d.order_id);
      })
      .catch(() => { /* nothing to prompt is indistinguishable from a failure here, and both mean: show nothing */ });
    return () => { cancelled = true; };
  }, []);

  if (!orderId || failed) return null;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await accountApi.reviewLink(orderId);
      navigate(`/rate/${token}`);
    } catch {
      // This card must never disturb the page it sits on — render nothing
      // rather than a broken button that goes nowhere.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void go()}
      disabled={busy}
      className="mb-4 flex w-full items-center gap-3 rounded-xl border border-cream-200 bg-white p-4 text-left shadow-card disabled:opacity-70"
    >
      <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" />
      <span className="flex-1 text-sm text-brand-800">
        How was your last order? <span className="text-brand-500">{busy ? 'One sec…' : 'Tap to rate'}</span>
      </span>
    </button>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { api } from '../../shared/api/client';

/**
 * Prompts a signed-in customer to rate their last order.
 *
 * Renders nothing at all when there is nothing due, and swallows its own
 * errors: a failed request here must never disturb the page it sits on.
 */
export function PendingReviewCard() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('account/pending-review')
      .then((d: { order_id: number | null; token?: string }) => {
        if (!cancelled && d.order_id && d.token) setToken(d.token);
      })
      .catch(() => { /* nothing to prompt is indistinguishable from a failure here, and both mean: show nothing */ });
    return () => { cancelled = true; };
  }, []);

  if (!token) return null;

  return (
    <Link
      to={`/rate/${token}`}
      className="mb-4 flex items-center gap-3 rounded-xl border border-cream-200 bg-white p-4 shadow-card"
    >
      <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" />
      <span className="flex-1 text-sm text-brand-800">
        How was your last order? <span className="text-brand-500">Tap to rate</span>
      </span>
    </Link>
  );
}

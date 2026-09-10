import { useState } from 'react';
import { Star, Phone, Check } from 'lucide-react';
import { adminReviewsApi } from '../api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { SkeletonRows } from '../../shared/components/Skeleton';
import { displayPhone } from '../../shared/lib/format';

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-brand-200'}`} />
      ))}
    </span>
  );
}

/**
 * The internal feedback list. Nothing here is public.
 *
 * Defaults to unacknowledged low ratings, because the reason this screen exists
 * is to get someone on the phone to an unhappy customer today — not to browse
 * praise.
 */
export function AdminReviews() {
  const [onlyLowUnacked, setOnlyLowUnacked] = useState(true);

  const { data, loading, error, refetch } = useFetch(
    () => adminReviewsApi.list(onlyLowUnacked ? { max_stars: 2, acked: 0 } : {}),
    [onlyLowUnacked],
  );
  const reviews = data?.reviews ?? [];

  async function ack(id: number) {
    await adminReviewsApi.ack(id);
    refetch();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Reviews</h1>
          <p className="text-sm text-brand-500">Internal feedback only — nothing here is public.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={onlyLowUnacked}
            onChange={(e) => setOnlyLowUnacked(e.target.checked)}
          />
          Needs follow-up
        </label>
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4">
        {loading && !data ? (
          <SkeletonRows rows={5} />
        ) : reviews.length === 0 ? (
          <p className="rounded-2xl border border-cream-200 bg-white px-4 py-8 text-center text-sm text-brand-400">
            {onlyLowUnacked ? 'Nothing needs following up.' : 'No reviews yet.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-cream-200 bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars n={r.stars} />
                  <span className="text-sm font-semibold text-brand-900">{r.name}</span>
                  <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-sm text-brand-600">
                    <Phone className="h-3.5 w-3.5" /> {displayPhone(r.phone)}
                  </a>
                  <span className="text-xs text-brand-400">
                    #{r.order_id} · {new Date(r.created_at).toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Customer-typed text. React escapes it; never reach for
                    dangerouslySetInnerHTML here. */}
                {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-brand-800">{r.comment}</p>}

                {r.dishes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.dishes.map((d, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-brand-600">
                        <Stars n={d.stars} /> {d.item_name}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3">
                  {r.acked_at ? (
                    <span className="flex items-center gap-1 text-xs text-brand-500">
                      <Check className="h-3.5 w-3.5" /> Followed up by {r.acked_label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void ack(r.id)}
                      className="rounded-lg border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                    >
                      Mark followed up
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

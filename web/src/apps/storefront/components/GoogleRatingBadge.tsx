import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { mapsKeyFor } from '../../shared/lib/mapsKey';
import { fetchGoogleRating, type GoogleRating } from '../../shared/lib/googleRating';

/**
 * "4.7 ★ on Google · 38 reviews", linking to the listing. Social proof from
 * the one source a new customer already trusts. Renders nothing until the
 * Place ID and Maps key are both set, and nothing at all if Google has no
 * rating for the place yet — an empty badge is worse than none.
 */
export function GoogleRatingBadge({ className = '' }: { className?: string }) {
  const { settings } = useAuth();
  const key = mapsKeyFor(settings);
  const placeId = settings?.google_place_id ?? '';
  const [rating, setRating] = useState<GoogleRating | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGoogleRating(key, placeId).then((r) => { if (!cancelled) setRating(r); });
    return () => { cancelled = true; };
  }, [key, placeId]);

  if (!rating) return null;

  const inner = (
    <>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="font-semibold text-brand-900">{rating.rating.toFixed(1)}</span>
      <span className="text-brand-600">on Google</span>
      <span className="text-brand-400">· {rating.count} review{rating.count === 1 ? '' : 's'}</span>
    </>
  );
  const cls = `inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-1.5 text-sm ${className}`;

  return rating.mapsUrl ? (
    <a href={rating.mapsUrl} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

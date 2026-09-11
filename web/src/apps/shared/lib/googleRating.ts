/**
 * The kitchen's live Google rating, from Places API (New) over plain fetch.
 *
 * From the browser on purpose: the Maps key is referrer-restricted, so a
 * server-side call would be refused. One small request per device per day —
 * cached in localStorage — with no map script loaded. Place Details is a
 * metered call, so the cache is not an optimisation, it is what keeps this
 * inside the free tier.
 */
export type GoogleRating = { rating: number; count: number; mapsUrl: string };

const CACHE_KEY = 'vk-google-rating';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { at: number; placeId: string; value: GoogleRating | null };

function readCache(placeId: string): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (c.placeId !== placeId || Date.now() - c.at > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(placeId: string, value: GoogleRating | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), placeId, value } satisfies Cached));
  } catch {
    /* storage unavailable: fetch again next time, no harm */
  }
}

/** Null when unconfigured, refused, or the place has no rating yet. */
export async function fetchGoogleRating(key: string, placeId: string): Promise<GoogleRating | null> {
  if (!key || !placeId) return null;
  const cached = readCache(placeId);
  if (cached) return cached.value;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri',
      },
    });
    if (!res.ok) {
      writeCache(placeId, null);   // a bad id or key: do not retry on every page view
      return null;
    }
    const d = (await res.json()) as { rating?: number; userRatingCount?: number; googleMapsUri?: string };
    const value = typeof d.rating === 'number' && (d.userRatingCount ?? 0) > 0
      ? { rating: d.rating, count: d.userRatingCount ?? 0, mapsUrl: d.googleMapsUri ?? '' }
      : null;
    writeCache(placeId, value);
    return value;
  } catch {
    return null;   // offline: nothing cached, try again next visit
  }
}

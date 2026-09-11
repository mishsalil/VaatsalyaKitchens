/**
 * Coordinates out of a Google Maps link — the thing a customer sends the
 * counter over WhatsApp. Pure; verified by web/scripts/verify-maps-link.mjs.
 */

export type LatLng = { lat: number; lng: number };

/** A pair is only accepted when it could be a place on Earth. */
function pair(latS: string, lngS: string): LatLng | null {
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  /* A bare "96238,36382" is a phone number split on the comma, not a place.
     Real coordinates carry decimals; integers only are refused. */
  if (!latS.includes('.') && !lngS.includes('.')) return null;
  return { lat, lng };
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const SHAPES: RegExp[] = [
  new RegExp(`[?&](?:q|query|destination|ll)=${NUM}(?:%2C|,)${NUM}`, 'i'), // ?q= / ?query= / ?destination=
  new RegExp(`/@${NUM},${NUM}`),                                             // /@lat,lng,zoom
  new RegExp(`!3d${NUM}!4d${NUM}`),                                          // data blob
];

/** Coordinates from a full Google Maps URL or a bare "lat, lng". Null when it
 *  cannot say — including short links, which hide the pair behind a redirect. */
export function parseMapsLink(text: string): LatLng | null {
  const s = text.trim();
  if (s === '') return null;

  for (const re of SHAPES) {
    const m = s.match(re);
    if (m) {
      const p = pair(m[1], m[2]);
      if (p) return p;
    }
  }

  const bare = s.match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  if (bare) return pair(bare[1], bare[2]);

  return null;
}

/** maps.app.goo.gl / goo.gl/maps — the shape WhatsApp actually sends. */
export function isShortMapsLink(text: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text.trim());
}

/** Turn-by-turn in the Maps app on a phone, the web on a desktop. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Navigation } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { mapsKeyFor } from '../../shared/lib/mapsKey';
import { useGeolocation } from '../../shared/hooks/useGeolocation';
import { loadGoogleMaps } from '../../shared/lib/googleMaps';
import { Input } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';

export type AddressDraft = {
  house: string;
  landmark: string;
  area: string;
  lat: number | null;
  lng: number | null;
};

/** Sitapur, the kitchen's town — where the map opens before anything is known. */
const KITCHEN = { lat: 27.5679, lng: 80.6817 };

/**
 * The pin is the truth. The customer drags it onto their gate; the fields
 * underneath are a label for humans. A reverse geocode fills "area" as a
 * starting point whenever the pin moves, but it is never a gate: a dragged pin
 * plus "Mishra Niwas, near Shiv Mandir" is a complete address.
 *
 * Only mounted when settings carry a Google Maps key — the parent falls back
 * to a textarea otherwise, so nothing here has to handle "no key".
 */
export function MapPinPicker({ value, onChange }: { value: AddressDraft; onChange: (d: AddressDraft) => void }) {
  const { settings } = useAuth();
  const key = mapsKeyFor(settings);
  const mapEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { locate, locating } = useGeolocation();

  /* The latest draft, readable from map callbacks that were bound once. */
  const valueRef = useRef(value);
  valueRef.current = value;
  /* What the geocoder last wrote into "area", so a later pin move may replace
     it — but never text the customer typed themselves. */
  const lastGeocoded = useRef('');

  const placePin = (lat: number, lng: number, recentre = true) => {
    const pos = { lat, lng };
    markerRef.current?.setPosition(pos);
    if (recentre) mapRef.current?.panTo(pos);
    onChange({ ...valueRef.current, lat, lng });

    const g = window.google;
    if (!g?.maps?.Geocoder) return;
    new g.maps.Geocoder().geocode({ location: pos }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.[0]) return;
      const area = String(results[0].formatted_address).replace(/, India$/, '');
      const current = valueRef.current.area.trim();
      if (current === '' || current === lastGeocoded.current) {
        lastGeocoded.current = area;
        onChange({ ...valueRef.current, lat, lng, area });
      }
    });
  };

  const onLocate = async (announceFailure = true) => {
    try {
      const r = await locate();
      placePin(parseFloat(r.lat), parseFloat(r.lng));
      mapRef.current?.setZoom(17);
    } catch (e) {
      if (announceFailure) setLoadError((e as Error).message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !mapEl.current) return;
        const g = window.google;
        const known = value.lat != null && value.lng != null;
        const start = known ? { lat: value.lat as number, lng: value.lng as number } : KITCHEN;

        const map = new g.maps.Map(mapEl.current, {
          center: start,
          zoom: known ? 17 : 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        const marker = new g.maps.Marker({ map, position: start, draggable: true, title: 'Drag me onto your gate' });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          placePin(p.lat(), p.lng(), false);
        });
        map.addListener('click', (e: any) => placePin(e.latLng.lat(), e.latLng.lng(), false));
        mapRef.current = map;
        markerRef.current = marker;

        /* Places Autocomplete (the new element). Biased to a radius around the
           kitchen so "Mishra Niwas" finds the one in Sitapur, not Lucknow. */
        if (searchEl.current && g.maps.places?.PlaceAutocompleteElement) {
          const ac = new g.maps.places.PlaceAutocompleteElement({
            locationBias: { center: KITCHEN, radius: 25000 },
            includedRegionCodes: ['in'],
          });
          ac.addEventListener('gmp-select', async (ev: any) => {
            const place = ev.placePrediction.toPlace();
            await place.fetchFields({ fields: ['location'] });
            if (place.location) {
              placePin(place.location.lat(), place.location.lng());
              map.setZoom(17);
            }
          });
          searchEl.current.replaceChildren(ac);
        }

        setReady(true);
        if (!known) void onLocate(false);
      })
      .catch((e: Error) => setLoadError(e.message));
    return () => {
      cancelled = true;
    };
    // The map is built once per key; the draft flows through valueRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (k: 'house' | 'landmark' | 'area') => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {/* The autocomplete is a web component with its own idea of width; the
          wrapper clips it and index.css forces the element to block/100%. */}
      <div ref={searchEl} className="w-full max-w-full overflow-hidden" />
      <div className="relative overflow-hidden rounded-xl border border-cream-200">
        <div ref={mapEl} className="h-56 w-full bg-cream-100 sm:h-64" />
        {!ready && !loadError && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-brand-500">Loading map…</p>
        )}
        {loadError && (
          <p className="absolute inset-x-0 bottom-0 bg-white/90 p-2 text-center text-xs text-red-600">{loadError}</p>
        )}
        <button
          type="button"
          onClick={() => void onLocate()}
          disabled={locating}
          className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 shadow disabled:opacity-60"
        >
          <Navigation className="h-3.5 w-3.5" /> {locating ? 'Finding…' : 'Use my location'}
        </button>
      </div>
      <p className="text-xs text-brand-500">Drag the pin onto your gate — that is where the rider goes.</p>
      <Field label="House / flat / shop" htmlFor="addr-house">
        <Input id="addr-house" value={value.house} onChange={set('house')} placeholder="Flat 3, Mishra Niwas" />
      </Field>
      <Field label="Landmark" htmlFor="addr-landmark">
        <Input id="addr-landmark" value={value.landmark} onChange={set('landmark')} placeholder="near Shiv Mandir" />
      </Field>
      <Field label="Area / street" htmlFor="addr-area" hint="filled in from the pin — edit if wrong">
        <Input id="addr-area" value={value.area} onChange={set('area')} placeholder="Badaura, Sitapur" />
      </Field>
    </div>
  );
}

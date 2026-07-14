import { useState } from 'react';

export interface GeoResult {
  lat: string;
  lng: string;
  address: string;
}

/**
 * Browser geolocation + OpenStreetMap Nominatim reverse geocoding. Ports
 * js/geolocation.js. `locate()` is called from a button click (so the browser
 * permission prompt has a user gesture); it resolves with {lat,lng,address}
 * or rejects with a user-readable message.
 */
export function useGeolocation() {
  const [status, setStatus] = useState('');
  const [locating, setLocating] = useState(false);

  const locate = (): Promise<GeoResult> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Your browser cannot share location — please type the address below.'));
        return;
      }
      setLocating(true);
      setStatus('Finding your location… (your browser may ask for permission)');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude.toFixed(7);
          const lng = pos.coords.longitude.toFixed(7);
          let address = '';
          try {
            // Nominatim usage policy: identify app, max 1 req/sec.
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
              { headers: { Accept: 'application/json' } }
            );
            const data = await res.json();
            if (data && data.display_name) {
              address = data.display_name;
              setStatus('Location found! Please check the address and add your house/flat number. (© OpenStreetMap)');
            } else {
              throw new Error('no address');
            }
          } catch {
            setStatus('Location captured! We could not read the street name — please type your address below (we still received your map location).');
          }
          setLocating(false);
          resolve({ lat, lng, address });
        },
        (err) => {
          setLocating(false);
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'No problem — please type your address below.'
              : 'Could not find your location — please type your address below.';
          setStatus(msg);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });

  return { locate, status, locating, setStatus };
}
/**
 * Loads the Google Maps JavaScript API once, on demand, with the key from
 * settings. The types are declared minimally here rather than pulling in
 * @types/google.maps: the surface we touch is small and stable, and the key
 * arrives at runtime so the script cannot be a static <script> tag anyway.
 */
declare global {
  interface Window {
    google?: any;
    __vkMapsReady?: () => void;
  }
}

let pending: Promise<void> | null = null;

export function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    window.__vkMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      '&libraries=places,geocoding&v=weekly&loading=async&callback=__vkMapsReady';
    s.async = true;
    s.onerror = () => {
      pending = null;
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(s);
  });
  return pending;
}

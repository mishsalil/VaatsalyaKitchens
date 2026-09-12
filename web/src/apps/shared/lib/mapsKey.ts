import type { Settings } from '../types';
import { isNativePlatform } from '../push/nativePush';

/**
 * Which Google Maps key this build should use.
 *
 * The website's key is restricted to the referrer vaatsalyakitchens.in. The
 * Android shell serves the storefront from https://localhost, which that
 * restriction refuses — and a referrer of "localhost" is not something worth
 * allow-listing on the public key. So the app carries its own key, restricted
 * by API and daily quota instead. Falls back to the web key when no app key is
 * set, so a single key still works for anyone who has not split them.
 */
export function mapsKeyFor(settings: Settings | null | undefined): string {
  if (!settings) return '';
  const web = settings.google_maps_key ?? '';
  const app = settings.google_maps_key_app ?? '';
  return isNativePlatform() ? (app || web) : web;
}

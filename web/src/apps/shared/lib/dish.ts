import type { MenuItem } from '../types';
import { mediaUrl } from './baseUrl';

/**
 * Every photo for a dish, in slot order, ready to display.
 *
 * The API reports which files exist (one directory read for the whole menu),
 * so the client no longer guesses by trying to load them. The id-derived URLs
 * below remain as a fallback for anything holding an item that predates the
 * `photos` field.
 *
 * mediaUrl() matters more than it looks: in the native app a bare "/menu/…"
 * would resolve against the bundle inside the APK, so an uploaded photo would
 * never appear.
 */
export function dishPhotos(item: MenuItem): string[] {
  if (item.photos?.length) return item.photos.map(mediaUrl);
  return [];
}

/**
 * First-choice URL when the API has not said what exists. Kept because
 * DishImage still falls back to probing extensions for items served by an
 * older response shape.
 */
export function dishImageUrl(item: MenuItem): string {
  return mediaUrl(item.image_url || `/menu/${item.id}.webp`);
}

/** Second-choice extension if the .webp is absent (phones/cameras produce .jpg). */
export function dishImageFallbackUrl(item: MenuItem): string {
  return mediaUrl(item.image_url || `/menu/${item.id}.jpg`);
}

/** A 1-2 letter serif initial for the no-photo fallback tile (e.g. "Paneer Tikka" → "PT"). */
export function dishInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'वा';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
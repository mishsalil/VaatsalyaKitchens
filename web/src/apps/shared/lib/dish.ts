import type { MenuItem } from '../types';

/**
 * Dish photos live as static files at `web/public/menu/{id}.webp` (with `.jpg`
 * as a fallback extension). This convention needs no DB column, no API change,
 * and no admin change — the SPA derives the URL from the item id alone. If an
 * item has an explicit `image_url` (future API field), that wins.
 */
export function dishImageUrl(item: MenuItem): string {
  return item.image_url || `/menu/${item.id}.webp`;
}

/** Second-choice extension if the .webp is absent (phones/cameras produce .jpg). */
export function dishImageFallbackUrl(item: MenuItem): string {
  return item.image_url || `/menu/${item.id}.jpg`;
}

/** A 1-2 letter serif initial for the no-photo fallback tile (e.g. "Paneer Tikka" → "PT"). */
export function dishInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'वा';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import type { MenuItem } from '../../types';
import { dishImageUrl, dishImageFallbackUrl, dishInitial, dishPhotos } from '../../lib/dish';
import { DishLightbox } from './DishLightbox';

type Props = {
  item: MenuItem;
  className?: string;
  /** Tailwind rounding utility for the tile (defaults to rounded-xl). */
  rounded?: string;
};

/**
 * A dish photo with a graceful, premium fallback.
 *
 * Tries `/menu/{id}.webp`, then `/menu/{id}.jpg`, and finally an elegant
 * cream tile with a gold utensil glyph and the dish initial — so the app
 * looks finished even before real photos are dropped in.
 */
export function DishImage({ item, className = '', rounded = 'rounded-xl' }: Props) {
  const [stage, setStage] = useState<'webp' | 'jpg' | 'fallback'>('webp');
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  /* The API lists the photos that exist. Falling back to the id-derived URL
     keeps this working for any caller holding an item from an older response,
     which is also what the webp/jpg probing below is for. */
  const photos = dishPhotos(item);
  const hasList = photos.length > 0;
  const current = Math.min(index, Math.max(photos.length - 1, 0));

  if (!hasList && stage === 'fallback') {
    return <FallbackTile name={item.name} rounded={rounded} className={className} />;
  }

  const src = hasList ? photos[current] : stage === 'webp' ? dishImageUrl(item) : dishImageFallbackUrl(item);

  return (
    <div className={`group relative overflow-hidden bg-cream-100 ${rounded} ${className}`}>
      {!loaded && <Shimmer rounded={rounded} />}
      <img
        src={src}
        alt={item.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (hasList) return; // the API said this file exists; do not guess further
          if (stage === 'webp') {
            setStage('jpg');
            setLoaded(false);
          } else {
            setStage('fallback');
          }
        }}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* The whole tile opens the viewer. A button rather than a click handler
          on the div, so it is reachable by keyboard and announced properly. */}
      {hasList && (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`View ${photos.length > 1 ? `${photos.length} photos` : 'photo'} of ${item.name}`}
          className="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        />
      )}

      {/* Dots, not swipe: a horizontal swipe inside a vertically scrolling menu
          is easy to trigger by accident, so changing photo here is deliberate. */}
      {photos.length > 1 && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
                setLoaded(false);
              }}
              aria-label={`Show photo ${i + 1} of ${item.name}`}
              aria-current={i === current}
              className={`h-1.5 rounded-full shadow-sm transition-all ${
                i === current ? 'w-3 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/90'
              }`}
            />
          ))}
        </div>
      )}

      {zoomed && (
        <DishLightbox photos={photos} name={item.name} startAt={current} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}

function Shimmer({ rounded }: { rounded: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${rounded} bg-cream-100`}>
      <div className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cream-200/60 to-transparent animate-shimmer`} />
    </div>
  );
}

function FallbackTile({ name, rounded, className }: { name: string; rounded: string; className?: string }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-cream-50 to-cream-200 ${rounded} ${className}`}
    >
      <div className="flex flex-col items-center gap-1.5 text-gold-500/70">
        <UtensilsCrossed className="h-6 w-6" strokeWidth={1.5} />
        <span className="font-serif text-lg font-semibold tracking-wide text-brand-300">
          {dishInitial(name)}
        </span>
      </div>
    </div>
  );
}
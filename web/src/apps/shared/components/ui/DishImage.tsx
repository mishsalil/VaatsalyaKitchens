import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import type { MenuItem } from '../../types';
import { dishImageUrl, dishImageFallbackUrl, dishInitial } from '../../lib/dish';

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

  if (stage === 'fallback') {
    return <FallbackTile name={item.name} rounded={rounded} className={className} />;
  }

  const src = stage === 'webp' ? dishImageUrl(item) : dishImageFallbackUrl(item);

  return (
    <div className={`relative overflow-hidden bg-cream-100 ${rounded} ${className}`}>
      {!loaded && <Shimmer rounded={rounded} />}
      <img
        src={src}
        alt={item.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (stage === 'webp') {
            setStage('jpg');
            setLoaded(false);
          } else {
            setStage('fallback');
          }
        }}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
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
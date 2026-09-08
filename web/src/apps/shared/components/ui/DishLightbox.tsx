import { useCallback, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Full-screen photo viewer for a dish.
 *
 * The menu tile is 96px, where three angles of the same curry are barely
 * distinguishable — so the extra photos are shown here, at a size where they
 * are worth having, rather than as a slider inside a tile that would also fight
 * the menu's vertical scrolling.
 *
 * Swipe, arrow keys and dots all work, because the same page is used on a
 * counter tablet and a customer's phone.
 */
export function DishLightbox({
  photos,
  name,
  startAt = 0,
  onClose,
}: {
  photos: string[];
  name: string;
  startAt?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startAt);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length),
    [photos.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while this is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  if (!photos.length) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-brand-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${name}`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-cream-100">
        <p className="truncate pr-4 text-sm font-semibold">{name}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photos"
          className="rounded-full p-2 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center px-4 pb-6"
        // Stop a tap on the photo itself from closing; the backdrop still does.
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart === null) return;
          const dx = e.changedTouches[0].clientX - touchStart;
          // 50px, so a slightly diagonal scroll does not flip the photo.
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          setTouchStart(null);
        }}
      >
        <img
          src={photos[index]}
          alt={`${name} — photo ${index + 1} of ${photos.length}`}
          className="max-h-full max-w-full rounded-2xl object-contain"
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 rounded-full bg-black/40 p-2 text-cream-50 hover:bg-black/60"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 rounded-full bg-black/40 p-2 text-cream-50 hover:bg-black/60"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-2 pb-6" onClick={(e) => e.stopPropagation()}>
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-6 bg-cream-50' : 'w-2 bg-cream-50/40 hover:bg-cream-50/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

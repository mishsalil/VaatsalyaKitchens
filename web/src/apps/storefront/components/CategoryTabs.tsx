import { useEffect, useState } from 'react';
import type { MenuCategory as Cat } from '../../shared/types';

/**
 * Swiggy-style sticky horizontal category pills. Auto-highlights the section
 * in view (IntersectionObserver) and smooth-scrolls on click. The matching
 * `MenuCategory` sections must render `id={`cat-${id}`}` with `scroll-mt-32`.
 */
export function CategoryTabs({ categories }: { categories: Cat[] }) {
  const [active, setActive] = useState<number | undefined>(categories[0]?.id);

  useEffect(() => {
    const els = categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = Number((visible[0].target as HTMLElement).id.replace('cat-', ''));
          setActive(id);
        }
      },
      { rootMargin: '-128px 0px -70% 0px', threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [categories]);

  const go = (id: number) => {
    setActive(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!categories.length) return null;

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-cream-200 bg-cream-50/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-3">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(c.id)}
            className={`chip shrink-0 ${active === c.id ? 'chip-active' : ''}`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
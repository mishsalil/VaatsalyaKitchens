import { useEffect, useRef, useState } from 'react';
import type { MenuCategory as Cat } from '../../shared/types';

/**
 * Category navigation for the order page, in two orientations that share one
 * scroll-spy:
 *
 *   CategoryTabs — sticky horizontal pills, shown below `lg`. On a phone a
 *     vertical rail would eat ~30% of a 375px viewport, so horizontal wins.
 *   CategoryRail — vertical list, shown from `lg` up. The page content is
 *     capped at max-w-5xl and desktop dish rows leave most of that empty, so
 *     the rail costs nothing and shows every category at once instead of the
 *     ~7 of 11 that fit horizontally.
 *
 * The matching `MenuCategory` sections must render `id={`cat-${id}`}`.
 */

/** Scroll-spy: which category section is currently at the top of the viewport. */
function useActiveCategory(categories: Cat[]): number | undefined {
  const [active, setActive] = useState<number | undefined>(categories[0]?.id);
  // Depend on the id list, not the array identity: callers rebuild the category
  // array on every render, and re-running this effect each time tore the
  // observer down before it could ever report a scroll.
  const key = categories.map((c) => c.id).join(',');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

function scrollToCategory(id: number) {
  document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function CategoryTabs({ categories }: { categories: Cat[] }) {
  const active = useActiveCategory(categories);
  const scroller = useRef<HTMLDivElement>(null);
  const activeChip = useRef<HTMLButtonElement>(null);
  // Which edges are still scrollable — drives the fades that tell the user
  // there are more categories off-screen (the scrollbar itself is hidden).
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    syncEdges();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  // Keep the highlighted pill visible, centring it by setting scrollLeft on the
  // strip itself. Deliberately NOT scrollIntoView: that also scrolls the PAGE
  // vertically to reveal the chip, which fought the smooth-scroll started by
  // tapping a category and dumped the user back at the top of the menu.
  useEffect(() => {
    const el = activeChip.current;
    const sc = scroller.current;
    if (!el || !sc) return;
    const target = el.offsetLeft - sc.clientWidth / 2 + el.offsetWidth / 2;
    sc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [active]);

  if (!categories.length) return null;

  return (
    /* Must stay a DIRECT child of the tall page container: a sticky element is
       clipped by its containing block, so wrapping this in a short div (as the
       page used to) unsticks it the moment you scroll past the strip's own
       height. Kept above the menu so a category is always one tap away. */
    <div className="sticky top-16 z-30 -mx-4 mt-3 border-b border-cream-200 bg-cream-50/95 backdrop-blur sm:-mx-6 lg:hidden">
      <div className="relative">
        <div
          ref={scroller}
          onScroll={syncEdges}
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-6"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              ref={active === c.id ? activeChip : undefined}
              type="button"
              onClick={() => scrollToCategory(c.id)}
              className={`chip shrink-0 ${active === c.id ? 'chip-active' : ''}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {edges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-cream-50 to-transparent" />
        )}
        {edges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-cream-50 to-transparent" />
        )}
      </div>
    </div>
  );
}

export function CategoryRail({ categories }: { categories: Cat[] }) {
  const active = useActiveCategory(categories);
  if (!categories.length) return null;

  return (
    <nav aria-label="Menu categories" className="hidden lg:block">
      <div className="sticky top-24">
        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-brand-400">Categories</p>
        <ul className="space-y-0.5">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => scrollToCategory(c.id)}
                aria-current={active === c.id ? 'true' : undefined}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                  active === c.id
                    ? 'bg-brand-900 text-cream-50'
                    : 'text-brand-600 hover:bg-cream-200/70 hover:text-brand-900'
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

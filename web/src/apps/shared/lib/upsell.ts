import type { MenuCategory, MenuItem } from '../types';

/**
 * What to offer on checkout, from the menu already loaded. Rules run in order
 * until `max` dishes are found; anything in the cart, unavailable to add, or in
 * a closed section is skipped. Categories are found by NAME so a renumbered
 * menu falls through to the generic fill instead of breaking. Once a rule has
 * spoken for a section (it fired, or the cart already satisfies it), that
 * section is not offered again by the generic fill below.
 */
export function suggestUpsells({ items, categories, cartItemIds, closedCategoryIds, max = 4 }: {
  items: MenuItem[]; categories: MenuCategory[]; cartItemIds: number[]; closedCategoryIds: number[]; max?: number;
}): MenuItem[] {
  const idOf = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? -1;
  const MAIN = idOf('Main Course');
  const TANDOORI_BREADS = idOf('Tandoori Breads');
  const TAWA_BREADS = idOf('Tawa Breads');
  const RICE = idOf('Rice and Biryani');
  const STARTERS = [idOf('Starters'), idOf('Tandoori Starters'), idOf('Fried Rice and Noodles')];
  const SALAD = idOf('Salads');

  const inCart = new Set(cartItemIds);
  const cartCats = new Set(items.filter((i) => inCart.has(i.id)).map((i) => i.category_id));
  const has = (...cats: number[]) => cats.some((c) => c >= 0 && cartCats.has(c));
  const bySort = (a: MenuItem, b: MenuItem) => a.sort_order - b.sort_order || a.id - b.id;
  const byPrice = (a: MenuItem, b: MenuItem) => a.price - b.price || a.id - b.id;

  const out: MenuItem[] = [];
  const pool = items.filter((i) => !inCart.has(i.id) && !closedCategoryIds.includes(i.category_id));
  const take = (cats: number[], n: number, cmp: (a: MenuItem, b: MenuItem) => number) => {
    for (const it of pool.filter((i) => cats.includes(i.category_id)).sort(cmp)) {
      if (out.length >= max || n <= 0) return;
      if (!out.includes(it)) { out.push(it); n--; }
    }
  };

  const handled = new Set<number>(cartCats);
  const markHandled = (cats: number[]) => cats.forEach((c) => c >= 0 && handled.add(c));

  if (has(MAIN)) {
    // Bread is one class spanning both categories: offer 2 from whichever are
    // open (so a closed Tandoori section still offers Tawa breads), and mark
    // the whole class handled either way so fill never adds a third bread.
    if (!has(TANDOORI_BREADS) && !has(TAWA_BREADS)) take([TANDOORI_BREADS, TAWA_BREADS], 2, bySort);
    markHandled([TANDOORI_BREADS, TAWA_BREADS]);
    if (!has(RICE)) take([RICE], 1, bySort);
    markHandled([RICE]);
  }
  if (has(...STARTERS) && !has(MAIN)) {
    // Cheapest main, deliberately: the natural first step up from a starter
    // is the least-committal main course, not a particular sort position.
    take([MAIN], 1, byPrice);
    markHandled([MAIN, ...STARTERS]);
  }
  if (!has(SALAD)) take([SALAD], 1, bySort);
  markHandled([SALAD]);

  // Fill: cheapest dish from each remaining section not already spoken for,
  // walking sections in menu order.
  const sortOrderOf = new Map(categories.map((c) => [c.id, c.sort_order]));
  const remainingCats = [...new Set(pool.map((i) => i.category_id))]
    .filter((c) => !handled.has(c))
    .sort((a, b) => (sortOrderOf.get(a) ?? 0) - (sortOrderOf.get(b) ?? 0) || a - b);
  for (const cat of remainingCats) {
    if (out.length >= max) break;
    const best = pool.filter((i) => i.category_id === cat && !out.includes(i)).sort(byPrice)[0];
    if (best) out.push(best);
  }
  return out.slice(0, max);
}

/**
 * Grouping order lines into the dishes a customer is asked to rate.
 *
 * Grouping is a presentation concern only. The database stores one
 * order_item_reviews row per order_items row, so every group carries the ids it
 * covers and the caller expands its chosen star back across them.
 */

export type RateOrderItem = {
  order_item_id: number;
  menu_item_id: number | null;
  item_name: string;
  qty: number;
};

export type RateLine = {
  /** Stable React key. `m:<id>` when the dish is known, `n:<name>` otherwise. */
  key: string;
  label: string;
  qty: number;
  orderItemIds: number[];
};

/**
 * Group by menu_item_id, falling back to the item name.
 *
 * The fallback is not cosmetic: order lines created before migration_007 have
 * menu_item_id = null. Grouping those by the null itself would merge every
 * unattributed dish in the order into one row labelled after whichever came
 * first, so they group by name instead — and a null-id line never merges with
 * an id-bearing one, because we cannot prove they are the same dish.
 */
export function groupRateLines(items: RateOrderItem[]): RateLine[] {
  const byKey = new Map<string, RateLine>();

  for (const item of items) {
    const key = item.menu_item_id !== null ? `m:${item.menu_item_id}` : `n:${item.item_name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += item.qty;
      existing.orderItemIds.push(item.order_item_id);
    } else {
      byKey.set(key, {
        key,
        label: item.item_name,
        qty: item.qty,
        orderItemIds: [item.order_item_id],
      });
    }
  }

  return [...byKey.values()];
}

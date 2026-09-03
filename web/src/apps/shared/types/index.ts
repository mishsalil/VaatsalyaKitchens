export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  has_pin: boolean;
}

export interface Branch {
  id: number;
  name: string;
  phone: string | null;
  whatsapp: string | null;
}

export interface Settings {
  kitchen_name?: string;
  kitchen_address?: string;
  kitchen_whatsapp: string;
  kitchen_phone_display: string;
  kitchen_email: string;
  logo_path?: string | null;
  /** Tax-exclusive GST rate (percent), split equally SGST/CGST. "0" disables GST. */
  gst_rate?: string;
  base_url: string;
  vapid_public_key: string;
  push_configured: boolean;
  branch: Branch | null;
}

export interface MeResponse {
  user: Customer | null;
  settings: Settings;
}

export interface MenuCategory {
  id: number;
  name: string;
  sort_order: number;
}

/** One opening window. weekday is 0=Sunday, matching Date.getDay(). */
export interface HourWindow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

/**
 * Opening hours as the storefront sees them (migration_010). The server
 * re-checks every rule on order create — this exists so the customer is guided
 * rather than rejected at the last step.
 */
export interface MenuHours {
  kitchen: HourWindow[];
  /** Only categories with their OWN windows appear; the rest follow the kitchen. */
  categories: Record<string, HourWindow[]>;
  open_now: boolean;
  closed_category_ids: number[];
  next_open_at: string | null;
  server_now: string;
}

export interface MenuSubcategory {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
}

export interface MenuVariant {
  id: number;
  name: string;
  /** Signed delta added to the item's base price. */
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

export interface MenuAddon {
  id: number;
  name: string;
  /** Absolute price added when this add-on is selected. */
  price: number;
  sort_order: number;
}

export interface MenuItem {
  id: number;
  category_id: number;
  subcategory_id: number | null;
  name: string;
  price: number;
  unit: string;
  /** Optional explicit image URL; otherwise the SPA derives /menu/{id}.webp. */
  image_url?: string;
  variants: MenuVariant[];
  addons: MenuAddon[];
}

/** Variant selection carried into a cart line / picker spec. */
export interface CartVariant {
  id: number;
  name: string;
  priceDelta: number;
}

export interface CartAddon {
  id: number;
  name: string;
  price: number;
}

export interface CartLine {
  /** `${itemId}::${variantId|0}::${addonIds sorted, joined by ','}`. */
  key: string;
  id: number;
  name: string;
  unit: string;
  /** Item base price (re-read server-side at order time anyway). */
  basePrice: number;
  variant?: CartVariant;
  addons: CartAddon[];
  qty: number;
}

/** Charged unit price = base + (variant delta) + sum(addon prices). */
export function linePrice(l: CartLine): number {
  return l.basePrice + (l.variant?.priceDelta ?? 0) + l.addons.reduce((s, a) => s + a.price, 0);
}

/** Stable cart key for one configuration of an item. */
export function cartKey(id: number, variantId?: number, addonIds: number[] = []): string {
  const sorted = [...addonIds].filter((n) => n > 0).sort((a, b) => a - b);
  return `${id}::${variantId ?? 0}::${sorted.join(',')}`;
}

/** Compose a human label: "Paneer Tikka (Full) + Cheese, Cashews". */
export function lineLabel(name: string, variantName?: string | null, addonsText?: string | null): string {
  let s = name;
  if (variantName) s += ` (${variantName})`;
  if (addonsText) s += ` + ${addonsText}`;
  return s;
}

export interface Address {
  id: number;
  label: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  is_default: number;
}

export interface OrderItem {
  item_name: string;
  /** Snapshot of the chosen variant name (e.g. "Full"), or null. */
  variant_name: string | null;
  /** Snapshot of chosen add-on names joined by ", ", or null. */
  addons_text: string | null;
  qty: number;
  unit: string;
  price: number;
}

export interface OrderListItem {
  id: number;
  occasion: string | null;
  needed_on: string;
  address_text: string | null;
  status: OrderStatus;
  total_estimate: number;
  /** Tax-exclusive GST snapshot (0 for orders placed before GST was enabled). */
  subtotal: number;
  cgst: number;
  sgst: number;
  gst_rate: number;
  /** Counter billing snapshot (migration_006). All 0/false for customer orders. */
  discount_pct: number;
  discount_amount: number;
  delivery_charge: number;
  is_complimentary: boolean;
  /**
   * Seconds left in which the customer may cancel this order themselves.
   * 0 once the window has passed or the kitchen has moved it past Confirmed.
   * The server is the authority — this only drives the countdown UI.
   */
  cancel_seconds_left: number;
  /**
   * Set when the customer has asked to cancel and the kitchen has not yet
   * confirmed (migration_009). The order is NOT cancelled while this is set —
   * `status` still reflects reality, because the food may still be cooking.
   */
  cancel_requested_at: string | null;
  created_at: string;
  branch_name: string | null;
  items: OrderItem[];
}

export interface Order extends OrderListItem {
  name: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}
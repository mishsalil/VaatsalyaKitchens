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
  csrf_token: string;
  settings: Settings;
}

export interface MenuCategory {
  id: number;
  name: string;
  sort_order: number;
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
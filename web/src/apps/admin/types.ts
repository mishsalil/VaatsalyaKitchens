import type { OrderStatus, OrderItem } from '../shared/types';
import type { AdminRole } from './rbac';

export type { AdminRole };

export interface AdminUser {
  id: number;
  username: string;
  role: string;
}

export interface AdminSettings {
  kitchen_whatsapp: string;
  kitchen_phone_display: string;
  kitchen_email: string;
  base_url: string;
  push_configured: boolean;
  /** Tax-exclusive GST rate (percent) — drives the New Order cart preview. */
  gst_rate: string;
  /** Receipt letterhead, readable by every role (unlike /admin/settings). */
  print_header: AdminPrintHeader;
}

/** Branding shown at the top of a printed receipt. */
export interface AdminPrintHeader {
  kitchen_name: string;
  kitchen_address: string;
  kitchen_phone_display: string;
  kitchen_email: string;
  gstin: string;
  print_footer: string;
  logo_path: string | null;
}

export interface AdminMeResponse {
  admin: AdminUser | null;
  csrf_token: string;
  settings: AdminSettings;
}

export interface AdminDashboardStats {
  new_orders: number;
  orders_today: number;
  revenue_today: number;
  customers: number;
  push_subscribers: number;
}

/** Kanban card / list row. */
export interface AdminOrderListItem {
  id: number;
  name: string;
  phone: string;
  occasion: string | null;
  needed_on: string;
  address_text: string | null;
  status: OrderStatus;
  total_estimate: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  gst_rate: number;
  /** Counter billing snapshot (migration_006). All 0/false for customer orders. */
  discount_pct: number;
  discount_amount: number;
  delivery_charge: number;
  is_complimentary: boolean;
  created_at: string;
  customer_id: number | null;
  branch_id: number | null;
  branch_name: string | null;
  item_count: number;
}

export interface AdminCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  has_pin: boolean;
  created_at: string;
  last_order_at: string | null;
  orders_count: number;
}

export interface AdminMenuCategory {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface AdminMenuSubcategory {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface AdminItemVariant {
  id: number;
  name: string;
  /** Signed delta added to the item base price. */
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

export interface AdminItemAddon {
  id: number;
  name: string;
  /** Absolute price added when selected. */
  price: number;
  available: boolean;
  sort_order: number;
}

export interface AdminMenuItem {
  id: number;
  category_id: number;
  subcategory_id: number | null;
  name: string;
  price: number;
  unit: string;
  available: boolean;
  sort_order: number;
  variants: AdminItemVariant[];
  addons: AdminItemAddon[];
}

export interface AdminAddress {
  id: number;
  label: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  is_default: number;
}

/** Compact order row inside a customer's history. */
export interface AdminCustomerOrder {
  id: number;
  name: string;
  phone: string;
  needed_on: string;
  status: OrderStatus;
  total_estimate: number;
  created_at: string;
}

export interface AdminCustomerDetail {
  customer: AdminCustomer;
  addresses: AdminAddress[];
  orders: AdminCustomerOrder[];
}

/** Editable branding/contact/print header values (settings table). */
export interface AdminSettingsFull {
  kitchen_name: string;
  kitchen_address: string;
  kitchen_whatsapp: string;
  kitchen_phone_display: string;
  kitchen_email: string;
  logo_path: string | null;
  gstin: string;
  print_footer: string;
  /** Tax-exclusive GST rate (percent), split equally SGST/CGST. 0 disables GST. */
  gst_rate: string;
}

export interface AdminSettingsResponse {
  settings: AdminSettingsFull;
  admin: AdminUser;
  vapid_configured: boolean;
}

/** Full order detail for the drawer. */
export interface AdminOrder extends AdminOrderListItem {
  lat: number | null;
  lng: number | null;
  notes: string | null;
  items: OrderItem[];
  customer: AdminCustomer | null;
}

/** A team member row (never includes password_hash). */
export interface AdminTeamUser {
  id: number;
  username: string;
  role: string;
  created_at: string;
}
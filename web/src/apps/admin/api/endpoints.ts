import { adminApi } from './client';
import type {
  AdminMeResponse,
  AdminDashboardStats,
  AdminOrderListItem,
  AdminOrder,
  AdminMenuCategory,
  AdminMenuSubcategory,
  AdminMenuItem,
  AdminCustomer,
  AdminCustomerDetail,
  AdminAddress,
  AdminSettingsFull,
  AdminSettingsResponse,
  AdminTeamUser,
} from '../types';
import type { OrderStatus } from '../../shared/types';

export const adminMeApi = {
  me: () => adminApi.get('me') as Promise<AdminMeResponse>,
};

export const adminTeamApi = {
  list: () => adminApi.get('team') as Promise<{ users: AdminTeamUser[]; roles: string[] }>,
  add: (data: { username: string; password: string; role: string }) =>
    adminApi.post('team/add', data) as Promise<{ id: number }>,
  updateRole: (id: number, role: string) => adminApi.post(`team/update_role/${id}`, { role }),
  resetPassword: (id: number, next: string) => adminApi.post(`team/reset_password/${id}`, { new: next }),
  delete: (id: number) => adminApi.post(`team/delete/${id}`, {}),
};

export const adminDashboardApi = {
  get: () =>
    adminApi.get('dashboard') as Promise<{ stats: AdminDashboardStats; open_orders: AdminOrderListItem[] }>,
};

export const adminAuthApi = {
  login: (username: string, password: string) =>
    adminApi.post('auth/login', { username, password }) as Promise<{ admin: { id: number; username: string; role: string }; csrf_token: string }>,
  logout: () => adminApi.post('auth/logout', {}),
};

/** One cart line sent to orders/create. Prices are re-read server-side. */
export interface AdminNewOrderLine {
  id: number;
  qty: number;
  variant_id?: number;
  addon_ids?: number[];
}

export interface AdminNewOrderPayload {
  name: string;
  phone: string;
  needed_on: string;
  address_text?: string;
  notes?: string;
  items: AdminNewOrderLine[];
  /** Counter billing. GST is charged on (subtotal - discount); delivery is added after tax. */
  discount_pct?: number;
  delivery_charge?: number;
  is_complimentary?: boolean;
}

/** Known customer matched by phone during counter entry. */
export interface AdminLookupCustomer {
  id: number;
  name: string;
  phone: string;
  address_text: string | null;
}

export const adminOrdersApi = {
  list: (status?: OrderStatus) => adminApi.get('orders' + (status ? `?status=${status}` : '')) as Promise<{ orders: AdminOrderListItem[] }>,
  show: (id: number) => adminApi.get(`orders/show/${id}`) as Promise<{ order: AdminOrder }>,
  updateStatus: (id: number, status: OrderStatus) =>
    adminApi.post(`orders/update_status/${id}`, { status }) as Promise<{ ok: true; status: OrderStatus; push_sent: number }>,
  export: (status?: OrderStatus) => adminApi.csvGet('orders/export' + (status ? `?status=${status}` : '')),
  lookupCustomer: (phone: string) =>
    adminApi.get(`orders/lookup_customer?phone=${encodeURIComponent(phone)}`) as Promise<{ customer: AdminLookupCustomer | null }>,
  create: (data: AdminNewOrderPayload) =>
    adminApi.post('orders/create', data) as Promise<{ order_id: number; total: number; complimentary: boolean }>,
  /** Edit an existing order — same payload as create; prices are re-resolved server-side. */
  update: (id: number, data: AdminNewOrderPayload) =>
    adminApi.post(`orders/update/${id}`, data) as Promise<{
      ok: true; order_id: number; total: number; complimentary: boolean;
    }>,
  /** Type-ahead over past customers (name or partial number) for counter entry. */
  searchCustomers: (q: string) =>
    adminApi.get(`orders/search_customers?q=${encodeURIComponent(q)}`) as Promise<{
      customers: AdminLookupCustomer[];
    }>,
  /** Confirm with the kitchen — also applies a pending customer request. */
  ackCancel: (id: number) =>
    adminApi.post(`orders/ack_cancel/${id}`, {}) as Promise<{ ok: true; acked_by: string; customer_notified: number }>,
  /** Decline a customer's cancellation request (food already cooked). */
  rejectCancel: (id: number, reason?: string) =>
    adminApi.post(`orders/reject_cancel/${id}`, reason ? { reason } : {}) as Promise<{ ok: true; customer_notified: number }>,
  /** Mint a single-use claim link so a counter customer can sign in on their phone. */
  claimLink: (orderId: number) =>
    adminApi.post(`orders/claim_link/${orderId}`, {}) as Promise<{
      token: string; phone: string; name: string; has_pin: boolean; days: number;
    }>,
};

/** Variant row sent to add_item/update_item (full-replace). id is optional on edit. */
export interface AdminVariantInput {
  id?: number;
  name: string;
  price_delta: number;
  is_default: boolean;
}

/** Add-on row sent to add_item/update_item (full-replace). id is optional on edit. */
export interface AdminAddonInput {
  id?: number;
  name: string;
  price: number;
  available: boolean;
}

export interface AdminItemPayload {
  category_id: number;
  subcategory_id?: number | null;
  name: string;
  price: number;
  unit: string;
  variants: AdminVariantInput[];
  addons: AdminAddonInput[];
}

export interface AdminMenuImportResult {
  ok: true;
  created: number;
  updated: number;
  categories_created: number;
  subcategories_created: number;
  errors: { row: number; msg: string }[];
}

export const adminMenuApi = {
  list: () =>
    adminApi.get('menu') as Promise<{ categories: AdminMenuCategory[]; subcategories: AdminMenuSubcategory[]; items: AdminMenuItem[] }>,
  addCategory: (name: string) => adminApi.post('menu/add_category', { name }) as Promise<{ id: number }>,
  renameCategory: (id: number, name: string) => adminApi.post(`menu/rename_category/${id}`, { name }),
  toggleCategory: (id: number, active: boolean) => adminApi.post(`menu/toggle_category/${id}`, { active }),
  deleteCategory: (id: number) => adminApi.post(`menu/delete_category/${id}`, {}),
  reorderCategories: (ids: number[]) => adminApi.post('menu/reorder_categories', { ids }),
  addSubcategory: (categoryId: number, name: string) =>
    adminApi.post('menu/add_subcategory', { category_id: categoryId, name }) as Promise<{ id: number }>,
  renameSubcategory: (id: number, name: string) => adminApi.post(`menu/rename_subcategory/${id}`, { name }),
  toggleSubcategory: (id: number, active: boolean) => adminApi.post(`menu/toggle_subcategory/${id}`, { active }),
  deleteSubcategory: (id: number) => adminApi.post(`menu/delete_subcategory/${id}`, {}),
  reorderSubcategories: (ids: number[]) => adminApi.post('menu/reorder_subcategories', { ids }),
  addItem: (data: AdminItemPayload) => adminApi.post('menu/add_item', data) as Promise<{ id: number }>,
  updateItem: (id: number, data: AdminItemPayload) => adminApi.post(`menu/update_item/${id}`, data),
  toggleItem: (id: number, available: boolean) => adminApi.post(`menu/toggle_item/${id}`, { available }),
  deleteItem: (id: number) => adminApi.post(`menu/delete_item/${id}`, {}),
  reorderItems: (ids: number[]) => adminApi.post('menu/reorder_items', { ids }),
  export: () => adminApi.csvGet('menu/export'),
  import: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return adminApi.post('menu/import', fd) as Promise<AdminMenuImportResult>;
  },
};

export const adminCustomersApi = {
  list: (q?: string) => adminApi.get('customers' + (q ? `?q=${encodeURIComponent(q)}` : '')) as Promise<{ customers: AdminCustomer[] }>,
  show: (id: number) => adminApi.get(`customers/show/${id}`) as Promise<AdminCustomerDetail>,
  update: (id: number, data: { name: string; phone: string }) => adminApi.post(`customers/update/${id}`, data),
  resetPin: (id: number) => adminApi.post(`customers/reset_pin/${id}`, {}),
  delete: (id: number) => adminApi.post(`customers/delete/${id}`, {}),
  export: () => adminApi.csvGet('customers/export'),
  import: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return adminApi.post('customers/import', fd) as Promise<{
      ok: true; created: number; skipped: number; errors: { row: number; msg: string }[];
    }>;
  },
};

export const adminAddressesApi = {
  list: (customerId: number) => adminApi.get(`addresses/index/${customerId}`) as Promise<{ addresses: AdminAddress[] }>,
  add: (customerId: number, data: { label: string; address_text: string; lat: number | null; lng: number | null }) =>
    adminApi.post(`addresses/add/${customerId}`, data) as Promise<{ id: number }>,
  update: (id: number, data: { label: string; address_text: string; lat: number | null; lng: number | null }) =>
    adminApi.post(`addresses/update/${id}`, data),
  delete: (id: number) => adminApi.post(`addresses/delete/${id}`, {}),
  setDefault: (id: number) => adminApi.post(`addresses/set_default/${id}`, {}),
};

export const adminSettingsApi = {
  get: () => adminApi.get('settings') as Promise<AdminSettingsResponse>,
  update: (data: Omit<AdminSettingsFull, 'logo_path'>) =>
    adminApi.post('settings/update', data) as Promise<{ ok: true; settings: AdminSettingsFull }>,
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    return adminApi.post('settings/upload_logo', fd) as Promise<{ ok: true; logo_path: string }>;
  },
  changePassword: (current: string, next: string) => adminApi.post('settings/change_password', { current, new: next }),
};

/** Staff-device push registration — kitchen alerts, bound to the admin (migration_008). */
export const adminPushApi = {
  subscribe: (subscription: unknown) => adminApi.post('push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => adminApi.post('push/unsubscribe', { endpoint }),
};

export const adminBroadcastApi = {
  get: () => adminApi.get('broadcast') as Promise<{ subscribers: number; push_configured: boolean }>,
  send: (data: { title: string; body: string; url?: string }) =>
    adminApi.post('broadcast/send', data) as Promise<{ ok: true; sent: number; failed: number }>,
};
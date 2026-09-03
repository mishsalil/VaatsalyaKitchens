import { api } from './client';
import type { Address, MeResponse, MenuCategory, MenuHours, MenuItem, Order, OrderListItem } from '../types';

export const meApi = {
  me: () => api.get('me') as Promise<MeResponse>,
};

export const menuApi = {
  get: () => api.get('menu') as Promise<{ categories: MenuCategory[]; items: MenuItem[]; hours: MenuHours }>,
};

export const authApi = {
  login: (phone: string, pin: string) => api.post('auth/login', { phone, pin }),
  logout: () => api.post('auth/logout', {}),
  /** Redeem a one-time claim link from a counter order (single use). */
  claim: (token: string) => api.post('auth/claim', { token }),
};

export const ordersApi = {
  create: (body: object) => api.post('orders/create', body) as Promise<{ order_id: number; token?: string }>,
  list: () => api.get('orders') as Promise<{ orders: OrderListItem[] }>,
  show: (id: number) => api.get(`orders/show/${id}`) as Promise<{ order: Order }>,
  /** Self-cancel, allowed only inside the server's window. */
  cancel: (id: number) => api.post(`orders/cancel/${id}`, {}) as Promise<{ ok: true; status: 'cancelled' }>,
};

export const addressesApi = {
  list: () => api.get('addresses') as Promise<{ addresses: Address[] }>,
  add: (body: { label: string; address_text: string; lat: number | null; lng: number | null }) =>
    api.post('addresses/add', body) as Promise<{ id: number }>,
  remove: (id: number) => api.post(`addresses/delete/${id}`, {}),
  setDefault: (id: number) => api.post(`addresses/set_default/${id}`, {}),
};

export const accountApi = {
  setPin: (pin: string) => api.post('account/set-pin', { pin }),
};

export const pushApi = {
  subscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    api.post('push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => api.post('push/unsubscribe', { endpoint }),
};
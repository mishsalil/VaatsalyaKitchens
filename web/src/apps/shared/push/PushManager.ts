import { pushApi } from '../api/endpoints';

/**
 * Singleton that owns the service worker + Push subscription, decoupled from
 * the order flow. The SPA subscribes on first visit (silent best-effort) and
 * re-attempts at several points; a real subscription always requires a user
 * gesture to grant notification permission, so requestPermission() is meant
 * to be called from a click handler.
 *
 * Why this exists separately from any page: notifications should work the
 * moment a customer opens the site — not only after they place an order — so
 * they never miss an update (confirmation, "out for delivery", etc.).
 */

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface PushState {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
}

type Listener = (state: PushState) => void;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

class PushManagerService {
  private vapidKey = '';
  private registration: ServiceWorkerRegistration | null = null;
  private listeners = new Set<Listener>();
  private state: PushState = { supported: false, permission: 'unsupported', subscribed: false };
  private initializing: Promise<void> | null = null;

  get supported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /** Register the SW and read the current permission/subscription state. */
  init(vapidKey: string): Promise<void> {
    this.vapidKey = vapidKey || '';
    if (this.initializing) return this.initializing;
    this.state = { supported: this.supported, permission: this.currentPermission(), subscribed: false };
    this.emit();

    if (!this.supported || !this.vapidKey) {
      this.initializing = Promise.resolve();
      return this.initializing;
    }
    this.initializing = (async () => {
      try {
        this.registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        await this.refreshSubscription();
      } catch {
        // SW failed to install — push unavailable, app keeps working.
      }
    })();
    return this.initializing;
  }

  private currentPermission(): PushPermission {
    if (!this.supported) return 'unsupported';
    return Notification.permission as PushPermission;
  }

  /** Re-read the active subscription and refresh state. */
  async refreshSubscription(): Promise<void> {
    if (!this.registration) return;
    const sub = await this.registration.pushManager.getSubscription();
    this.state = { ...this.state, permission: this.currentPermission(), subscribed: !!sub };
    this.emit();
  }

  getState(): PushState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snap = this.getState();
    this.listeners.forEach((l) => l(snap));
  }

  /**
   * Silent best-effort subscription. Only succeeds if permission is already
   * granted. Safe to call repeatedly. Returns true if subscribed afterwards.
   */
  /**
   * The browser-level subscription for this device, creating it if needed, with
   * NO server registration. The admin area needs the raw subscription so it can
   * register the device against the signed-in ADMIN instead of the customer —
   * registering it as a customer first would leave a stray unowned row behind.
   */
  async ensureBrowserSubscription(): Promise<PushSubscription | null> {
    if (!this.supported || !this.vapidKey) return null;
    if (!this.registration) await this.init(this.vapidKey);
    if (!this.registration) return null;
    if (this.currentPermission() !== 'granted') return null;

    const existing = await this.registration.pushManager.getSubscription();
    if (existing) return existing;
    try {
      return await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(this.vapidKey) as unknown as BufferSource,
      });
    } catch {
      return null;
    }
  }

  async ensureSubscribed(): Promise<boolean> {
    const sub = await this.ensureBrowserSubscription();
    if (!sub) {
      this.state = { ...this.state, subscribed: false };
      this.emit();
      return false;
    }
    // Keep the server in sync (idempotent upsert by endpoint).
    try {
      await pushApi.subscribe(sub.toJSON() as any);
    } catch {
      // Best effort; subscription still valid locally.
    }
    this.state = { ...this.state, permission: 'granted', subscribed: true };
    this.emit();
    return true;
  }

  /**
   * Ask the browser for permission (call from a user gesture). On grant,
   * subscribe and register with the server. Returns the final permission.
   */
  async requestPermission(): Promise<PushPermission> {
    if (!this.supported || !this.vapidKey) return 'unsupported';
    if (!this.registration) await this.init(this.vapidKey);
    const perm = await Notification.requestPermission();
    this.state = { ...this.state, permission: perm as PushPermission };
    this.emit();
    if (perm === 'granted') {
      await this.ensureSubscribed();
    }
    return perm as PushPermission;
  }

  /** Unsubscribe this device and tell the server to drop the endpoint. */
  async unsubscribe(): Promise<void> {
    if (!this.registration) return;
    const sub = await this.registration.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await pushApi.unsubscribe(endpoint);
      } catch {
        /* best effort */
      }
    }
    this.state = { ...this.state, subscribed: false };
    this.emit();
  }
}

export const pushManager = new PushManagerService();
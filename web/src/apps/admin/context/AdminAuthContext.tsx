import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { adminMeApi, adminAuthApi } from '../api/endpoints';
import { setAdminCsrfToken } from '../api/client';
import { can as canForRole, type AdminCap } from '../rbac';
import type { AdminUser, AdminSettings } from '../types';

interface AdminAuthContextValue {
  admin: AdminUser | null;
  settings: AdminSettings | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Does the current admin's role have the given capability? (UX mirror; server enforces.) */
  can: (cap: AdminCap) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const data = await adminMeApi.me();
    setAdminCsrfToken(data.csrf_token);
    setAdmin(data.admin);
    setSettings(data.settings);
    return data;
  };

  useEffect(() => {
    loadMe().catch(() => setAdmin(null)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      await loadMe();
    } catch {
      setAdmin(null);
    }
  };

  const login = async (username: string, password: string) => {
    await adminAuthApi.login(username, password);
    await loadMe();
  };

  const logout = async () => {
    await adminAuthApi.logout();
    setAdminCsrfToken(null);
    setAdmin(null);
    // Refresh the (anonymous) CSRF token so a subsequent login can proceed.
    const data = await adminMeApi.me().catch(() => null);
    if (data) setAdminCsrfToken(data.csrf_token);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, settings, loading, login, logout, refresh, can: (cap) => canForRole(admin?.role, cap) }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
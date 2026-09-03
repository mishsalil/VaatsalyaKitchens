import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { meApi, authApi } from '../api/endpoints';
import { setAuthToken } from '../api/client';
import type { Customer, Settings } from '../types';

interface AuthContextValue {
  user: Customer | null;
  settings: Settings | null;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const data = await meApi.me();
    setUser(data.user);
    setSettings(data.settings);
    return data;
  };

  useEffect(() => {
    loadMe().catch(() => setUser(null)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      await loadMe();
    } catch {
      setUser(null);
    }
  };

  const login = async (phone: string, pin: string) => {
    const data = await authApi.login(phone, pin);
    // Store before loadMe(), so the very next request already carries it.
    setAuthToken(data?.token ?? null);
    await loadMe();
  };

  const logout = async () => {
    // Logout revokes the token server-side, so it must still be attached to
    // this request; clear it only afterwards.
    await authApi.logout();
    setAuthToken(null);
    setUser(null);
    // settings stay (branch/contact don't change on logout)
    const data = await meApi.me().catch(() => null);
    if (data) setSettings(data.settings);
  };

  return (
    <AuthContext.Provider value={{ user, settings, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
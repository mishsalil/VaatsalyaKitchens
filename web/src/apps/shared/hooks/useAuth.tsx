import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { meApi, authApi } from '../api/endpoints';
import { setCsrfToken } from '../api/client';
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
    setCsrfToken(data.csrf_token);
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
    await authApi.login(phone, pin);
    await loadMe();
  };

  const logout = async () => {
    await authApi.logout();
    setCsrfToken(null);
    setUser(null);
    // settings stay (branch/contact don't change on logout)
    const data = await meApi.me().catch(() => null);
    if (data) {
      setCsrfToken(data.csrf_token);
      setSettings(data.settings);
    }
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
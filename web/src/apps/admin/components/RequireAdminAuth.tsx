import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

/** Guard for admin pages — sends unsigned-in admins to /admin/login. */
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream-100 text-brand-400">
        <span className="animate-pulse text-sm">Loading…</span>
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
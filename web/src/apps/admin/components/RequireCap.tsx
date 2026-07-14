import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../../shared/context/ToastContext';
import type { AdminCap } from '../rbac';

/**
 * UX-only route guard: redirects to the dashboard (with a toast) when the
 * current admin's role lacks the cap. The server enforces every cap on
 * /api/admin/* regardless — this just avoids showing an empty page.
 */
export function RequireCap({ cap, children }: { cap: AdminCap; children: ReactNode }) {
  const { admin, loading, can } = useAdminAuth();
  const toast = useToast();

  useEffect(() => {
    if (!loading && admin && !can(cap)) {
      toast.error('You do not have access to that page.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, admin, cap]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream-100 text-brand-400">
        <span className="animate-pulse text-sm">Loading…</span>
      </div>
    );
  }
  if (!admin || !can(cap)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}
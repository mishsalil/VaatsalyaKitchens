import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Users, Clock, IndianRupee, PackageOpen } from 'lucide-react';
import { adminDashboardApi } from '../api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { rupees } from '../../shared/lib/format';
import { Skeleton } from '../../shared/components/Skeleton';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { StatTile } from '../components/StatTile';
import type { OrderStatus } from '../../shared/types';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useFetch(() => adminDashboardApi.get(), []);

  // Auto-refresh every 30s — the kitchen sees fresh orders without reloading.
  useEffect(() => {
    const t = setInterval(() => refetch(), 30000);
    return () => clearInterval(t);
  }, [refetch]);

  const stats = data?.stats;
  const open = data?.open_orders ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Dashboard</h1>
          <p className="text-sm text-brand-500">Live overview · refreshes every 30s</p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {loading && !stats ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : stats ? (
          <>
            <StatTile icon={<PackageOpen className="h-5 w-5" />} label="New orders" value={stats.new_orders} accent="maroon" />
            <StatTile icon={<Clock className="h-5 w-5" />} label="Orders today" value={stats.orders_today} accent="gold" />
            <StatTile icon={<IndianRupee className="h-5 w-5" />} label="Revenue today" value={rupees(stats.revenue_today)} accent="emerald" />
            <StatTile icon={<Users className="h-5 w-5" />} label="Customers" value={stats.customers} />
            <StatTile icon={<Bell className="h-5 w-5" />} label="Push subs" value={stats.push_subscribers} />
          </>
        ) : null}
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Orders in progress */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Orders in progress</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card">
          {loading && !data ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : open.length === 0 ? (
            <p className="p-6 text-center text-sm text-brand-500">No open orders right now. Enjoy the calm. 🍵</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-500">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Placed</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5 text-center">Items</th>
                  <th className="px-4 py-2.5">Needed</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {open.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer transition-colors hover:bg-cream-50"
                    onClick={() => navigate('/admin/orders')}
                  >
                    <td className="px-4 py-2.5 font-semibold text-brand-900">#{o.id}</td>
                    <td className="px-4 py-2.5 text-brand-600">{formatTime(o.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-brand-900">{o.name}</p>
                      <p className="text-xs text-brand-400">{o.phone}</p>
                    </td>
                    <td className="px-4 py-2.5 text-center text-brand-600">{o.item_count}</td>
                    <td className="px-4 py-2.5 text-brand-600">{o.needed_on}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-brand-900">{rupees(o.total_estimate)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status as OrderStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
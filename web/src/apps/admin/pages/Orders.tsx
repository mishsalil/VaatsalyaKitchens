import { useState } from 'react';
import { adminOrdersApi } from '../api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { Skeleton } from '../../shared/components/Skeleton';
import { OrdersKanban } from '../components/OrdersKanban';
import { OrderDrawer } from '../components/OrderDrawer';
import { ImportExportBar } from '../components/ImportExportBar';

export function AdminOrders() {
  const { data, loading, error, refetch } = useFetch(() => adminOrdersApi.list(), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const orders = data?.orders ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Orders</h1>
          <p className="text-sm text-brand-500">Click a card to see details and update its status.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportBar entity="Orders" filename="vaatsalya-orders.csv" onExport={() => adminOrdersApi.export()} />
          <button
            type="button"
            onClick={() => refetch(true)}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-72 shrink-0 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : (
          <OrdersKanban orders={orders} onSelect={setSelectedId} selectedId={selectedId ?? undefined} />
        )}
      </div>

      <OrderDrawer orderId={selectedId} onClose={() => setSelectedId(null)} onChanged={refetch} />
    </div>
  );
}
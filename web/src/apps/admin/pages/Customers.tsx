import { useState } from 'react';
import { Search } from 'lucide-react';
import { adminCustomersApi } from '../api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { Skeleton } from '../../shared/components/Skeleton';
import { Input } from '../../shared/components/ui/Input';
import { displayPhone } from '../../shared/lib/format';
import { sampleCustomersCsv } from '../../shared/lib/sampleCsv';
import { CustomerDrawer } from '../components/CustomerDrawer';
import { ImportExportBar } from '../components/ImportExportBar';

export function AdminCustomers() {
  const [q, setQ] = useState('');
  const [committed, setCommitted] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, loading, error, refetch } = useFetch(() => adminCustomersApi.list(committed), [committed]);
  const customers = data?.customers ?? [];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCommitted(q.trim());
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Customers</h1>
          <p className="text-sm text-brand-500">Search by name or phone, then edit profile, reset PIN, manage addresses, or remove.</p>
        </div>
        <ImportExportBar
          entity="Customers"
          filename="vaatsalya-customers.csv"
          sampleCsv={sampleCustomersCsv()}
          sampleFilename="vaatsalya-customers-sample.csv"
          blurb={
            <>
              Columns: <code>name, phone, email</code>. <code>phone</code> is a 10-digit number;
              <code> email</code> is optional. Existing customers are matched by phone and skipped.
            </>
          }
          onExport={() => adminCustomersApi.export()}
          onImport={(file) => adminCustomersApi.import(file)}
          onImported={refetch}
        />
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-300" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or phone…"
            className="pl-9"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-brand-800"
        >
          Search
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card">
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <p className="px-4 py-3 text-sm text-red-700">{error}</p>
        ) : customers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-brand-400">{committed ? 'No customers match your search.' : 'No customers yet.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-brand-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Phone</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Orders</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Joined</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-brand-900">{c.name}</span>
                    {!c.has_pin && <span className="ml-2 text-[10px] font-semibold uppercase text-brand-300">no pin</span>}
                  </td>
                  <td className="px-4 py-3 text-brand-700">{displayPhone(c.phone)}</td>
                  <td className="hidden px-4 py-3 text-brand-700 sm:table-cell">{c.orders_count}</td>
                  <td className="hidden px-4 py-3 text-brand-400 sm:table-cell">
                    {new Date(c.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className="rounded-full border border-cream-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CustomerDrawer customerId={selectedId} onClose={() => setSelectedId(null)} onChanged={refetch} />
    </div>
  );
}
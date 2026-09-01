import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CustomerLayout } from './apps/storefront/layout/CustomerLayout';
import { Home } from './apps/storefront/pages/Home';
import { Order } from './apps/storefront/pages/Order';
import { Checkout } from './apps/storefront/pages/Checkout';
import { OrderSuccess } from './apps/storefront/pages/OrderSuccess';
import { MyAccount } from './apps/storefront/pages/MyAccount';
import { Login } from './apps/storefront/pages/Login';
import { Claim } from './apps/storefront/pages/Claim';
import { RequireAuth } from './apps/shared/components/RequireAuth';

// The entire admin area is one lazy chunk — the customer storefront bundle
// never includes admin code. Loads only when someone visits /admin/*.
const AdminArea = lazy(() => import('./apps/admin/AdminArea'));

function AdminLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100 text-brand-400">
      <span className="animate-pulse text-sm">Loading admin…</span>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Admin subtree (own VKADMIN session + layout, isolated from the storefront) */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<AdminLoading />}>
            <AdminArea />
          </Suspense>
        }
      />

      {/* Customer storefront */}
      <Route element={<CustomerLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/order" element={<Order />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-success/:id" element={<OrderSuccess />} />
        <Route path="/login" element={<Login />} />
        {/* One-time claim link from a counter order (WhatsApped by the rep). */}
        <Route path="/claim/:token" element={<Claim />} />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <MyAccount />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { RequireAdminAuth } from './components/RequireAdminAuth';
import { RequireCap } from './components/RequireCap';
import { AdminLayout } from './layout/AdminLayout';
import { AdminLogin } from './pages/Login';
import { AdminDashboard } from './pages/Dashboard';
import { AdminNewOrder } from './pages/NewOrder';
import { AdminOrders } from './pages/Orders';
import { AdminMenu } from './pages/Menu';
import { AdminCustomers } from './pages/Customers';
import { AdminBroadcast } from './pages/Broadcast';
import { AdminSettings } from './pages/Settings';
import { AdminTeam } from './pages/Team';
import { AdminOrderPrint } from './pages/OrderPrint';

/**
 * The /admin/* subtree. Lazily loaded from App.tsx so the entire admin area
 * (client, auth, layout, pages) lives in its own bundle chunk — the customer
 * storefront never downloads admin code. AdminAuthProvider gives the subtree
 * its own VKADMIN session + CSRF bootstrap, isolated from the customer auth.
 *
 * Each page under the layout is wrapped in RequireCap (UX mirror of the
 * server-side cap check in /api/admin/*). The print route is full-bleed (no
 * sidebar) but still cap-gated to `print`, which every role has.
 */
/**
 * Where /admin lands. Order entry is the highest-frequency job in the kitchen
 * (100-200x/day against a dashboard glanced at once), so it owns the default
 * route for everyone who can take orders. Riders lack `new_order` and keep the
 * dashboard — routing them at it directly avoids a pointless denied-access toast.
 */
function AdminHome() {
  const { can } = useAdminAuth();
  return <Navigate to={can('new_order') ? 'new-order' : 'dashboard'} replace />;
}

export default function AdminArea() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route
          element={
            <RequireAdminAuth>
              <AdminLayout />
            </RequireAdminAuth>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="new-order" element={<RequireCap cap="new_order"><AdminNewOrder /></RequireCap>} />
          {/* Same screen as new-order, hydrated from an existing order. */}
          <Route path="orders/:id/edit" element={<RequireCap cap="new_order"><AdminNewOrder /></RequireCap>} />
          <Route path="dashboard" element={<RequireCap cap="dashboard"><AdminDashboard /></RequireCap>} />
          <Route path="orders" element={<RequireCap cap="orders"><AdminOrders /></RequireCap>} />
          <Route path="menu" element={<RequireCap cap="menu"><AdminMenu /></RequireCap>} />
          <Route path="customers" element={<RequireCap cap="customers"><AdminCustomers /></RequireCap>} />
          <Route path="broadcast" element={<RequireCap cap="broadcast"><AdminBroadcast /></RequireCap>} />
          <Route path="settings" element={<RequireCap cap="settings"><AdminSettings /></RequireCap>} />
          <Route path="team" element={<RequireCap cap="roles"><AdminTeam /></RequireCap>} />
        </Route>
        {/* Printable receipt — guarded + cap-gated, but full-bleed (no sidebar). */}
        <Route
          path="orders/:id/print"
          element={
            <RequireAdminAuth>
              <RequireCap cap="print">
                <AdminOrderPrint />
              </RequireCap>
            </RequireAdminAuth>
          }
        />
        <Route path="*" element={<AdminHome />} />
      </Routes>
    </AdminAuthProvider>
  );
}
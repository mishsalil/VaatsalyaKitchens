import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, UtensilsCrossed, Users, Bell, Settings as SettingsIcon,
  LogOut, Menu, X, KeyRound, UserCog, PlusCircle,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { can, type AdminCap, roleLabel } from '../rbac';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { StaffAlerts } from '../components/StaffAlerts';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; cap: AdminCap };

// Ordered by how often the job is actually done: order entry runs 100-200x a
// day, the board is watched all shift, the dashboard is a once-a-day glance and
// the rest are edited once or twice a month.
const NAV: NavItem[] = [
  { to: '/admin/new-order', label: 'New Order', icon: PlusCircle, cap: 'new_order' },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList, cap: 'orders' },
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, cap: 'dashboard' },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, cap: 'menu' },
  { to: '/admin/customers', label: 'Customers', icon: Users, cap: 'customers' },
  { to: '/admin/broadcast', label: 'Broadcast', icon: Bell, cap: 'broadcast' },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon, cap: 'settings' },
  { to: '/admin/team', label: 'Team', icon: UserCog, cap: 'roles' },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <img src="/favicon.svg" alt="Vaatsalya Kitchens logo" className="h-8 w-8" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-lg font-bold text-brand-900">
          <span className="font-devanagari" lang="hi">वात्सल्य</span>{' '}
          <span className="text-gold-600">Kitchens</span>
        </span>
        <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-400">Admin</span>
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { admin } = useAdminAuth();
  const items = NAV.filter((item) => can(admin?.role, item.cap));
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-brand-900 text-cream-50' : 'text-brand-600 hover:bg-cream-100 hover:text-brand-900'
              }`
            }
          >
            <Icon className="h-4 w-4" /> {item.label}
          </NavLink>
        );
      })}
      <div className="mt-2 border-t border-cream-200 pt-2">
        <span className="px-3 text-xs text-brand-400">
          {admin?.username} · {admin ? roleLabel(admin.role) : ''}
        </span>
      </div>
    </nav>
  );
}

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  if (!admin) return <Navigate to="/admin/login" replace />;

  const signOut = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  const ChangePwButton = ({ onClick }: { onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-cream-100 hover:text-brand-900"
    >
      <KeyRound className="h-4 w-4" /> Change password
    </button>
  );

  return (
    <div className="min-h-dvh bg-cream-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col gap-4 border-r border-cream-200 bg-white p-4 sm:flex">
        <Wordmark />
        <div className="flex-1"><NavLinks /></div>
        <div className="flex flex-col gap-1">
          <StaffAlerts />
          <ChangePwButton onClick={() => setPwOpen(true)} />
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-cream-100 hover:text-brand-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-200 bg-white px-4 py-3 sm:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-brand-700 hover:bg-cream-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile nav overlay */}
      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-brand-950/40" />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col gap-4 bg-white p-4 shadow-sheet animate-fade-in">
            <div className="flex items-center justify-between">
              <Wordmark />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-brand-500 hover:bg-cream-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1"><NavLinks onNavigate={() => setOpen(false)} /></div>
            <div className="flex flex-col gap-1">
              <ChangePwButton onClick={() => { setOpen(false); setPwOpen(true); }} />
              <button type="button" onClick={() => { setOpen(false); signOut(); }} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 hover:bg-cream-100">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="sm:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
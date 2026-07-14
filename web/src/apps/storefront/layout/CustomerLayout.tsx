import type { ReactNode } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { Home as HomeIcon, UtensilsCrossed, User, LogIn, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useCart } from '../../shared/context/CartContext';

function Wordmark() {
  const { settings } = useAuth();
  const logo = settings?.logo_path;
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <img src={logo ?? '/favicon.svg'} alt="Vaatsalya Kitchens logo" className="h-9 w-9 rounded-full object-cover" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-2xl font-bold text-brand-900">
          <span className="font-devanagari" lang="hi">वात्सल्य</span>{' '}
          <span className="text-gold-600">Kitchens</span>
        </span>
        <span className="mt-1 hidden items-center gap-1 text-[11px] font-medium text-brand-500 sm:flex">
          <MapPin className="h-3 w-3 text-gold-600" /> Home delivery · Order ahead
        </span>
      </span>
    </Link>
  );
}

/** Desktop nav link with a maroon underline when active. */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'text-brand-900' : 'text-brand-500 hover:text-brand-800'
  }`;

function DesktopNav() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      <NavLink to="/" className={navLinkClass} end>
        {({ isActive }) => (
          <>
            <HomeIcon className="h-4 w-4" /> Home
            {isActive && <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-brand-900" />}
          </>
        )}
      </NavLink>
      <NavLink to="/order" className={navLinkClass}>
        {({ isActive }) => (
          <>
            <UtensilsCrossed className="h-4 w-4" /> Order
            {count > 0 && (
              <span className="ml-0.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[11px] font-bold text-brand-950">{count}</span>
            )}
            {isActive && <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-brand-900" />}
          </>
        )}
      </NavLink>
      {user ? (
        <>
          <NavLink to="/account" className={navLinkClass}>
            {({ isActive }) => (
              <>
                <User className="h-4 w-4" /> Account
                {isActive && <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-brand-900" />}
              </>
            )}
          </NavLink>
          <button
            type="button"
            onClick={logout}
            className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-cream-300 px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:border-brand-300 hover:bg-cream-100"
          >
            Sign out
          </button>
        </>
      ) : (
        <NavLink
          to="/login"
          className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-cream-50 transition-all hover:bg-brand-800"
        >
          <LogIn className="h-4 w-4" /> Sign in
        </NavLink>
      )}
    </nav>
  );
}

export function CustomerLayout() {
  const { user, settings, loading } = useAuth();
  const { count } = useCart();
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-cream-100">
      {/* Clean white sticky app bar */}
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-white/95 pt-safe backdrop-blur">
        <div className="container-wide flex h-16 items-center justify-between">
          <Wordmark />
          <DesktopNav />
        </div>
      </header>

      {/* Page content. pb for the mobile bottom nav + sticky cart bar. */}
      <main className="flex-1 pb-28 sm:pb-12">
        <Outlet key={location.pathname} />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-white/95 pb-safe backdrop-blur sm:hidden">
        <div className="grid grid-cols-3">
          <BottomTab to="/" icon={<HomeIcon className="h-5 w-5" />} label="Home" end />
          <BottomTab to="/order" icon={<UtensilsCrossed className="h-5 w-5" />} label="Order" badge={count} />
          <BottomTab
            to={user ? '/account' : '/login'}
            icon={user ? <User className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            label={user ? 'Account' : 'Sign in'}
          />
        </div>
      </nav>

      {/* Minimal footer */}
      <footer className="hidden border-t border-cream-200 bg-white px-4 py-6 text-sm text-brand-500 sm:block">
        <div className="container-wide flex flex-wrap items-center justify-between gap-3">
          <p>
            <span className="font-devanagari text-brand-700" lang="hi">वात्सल्य</span> Kitchens — food made with the warmth of home.
          </p>
          {!loading && settings && (
            <a href={`tel:+${settings.kitchen_whatsapp}`} className="link-quiet inline-flex items-center gap-1.5 font-medium">
              <Phone className="h-4 w-4 text-gold-600" /> {settings.kitchen_phone_display}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function BottomTab({ to, icon, label, end, badge }: { to: string; icon: ReactNode; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
          isActive ? 'text-brand-900' : 'text-brand-400'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            {icon}
            {badge ? (
              <span className="absolute -right-2.5 -top-1.5 rounded-full bg-brand-900 px-1.5 py-0.5 text-[10px] font-bold text-cream-50">{badge}</span>
            ) : null}
          </span>
          {label}
          {isActive && <span className="absolute top-0 h-1 w-8 rounded-full bg-brand-900" />}
        </>
      )}
    </NavLink>
  );
}
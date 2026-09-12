import { useEffect, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { Home as HomeIcon, UtensilsCrossed, User, LogIn, MapPin } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useCart } from '../../shared/context/CartContext';

/** The logo alone — it sits in the header's centre column. */
function Logo() {
  const { settings } = useAuth();
  const logo = settings?.logo_path;
  return (
    <Link to="/" className="flex items-center">
      <img src={logo ?? '/favicon.svg'} alt="Vaatsalya Kitchens logo" className="h-14 w-14 rounded-full object-cover sm:h-[4.5rem] sm:w-[4.5rem]" />
    </Link>
  );
}

/** The name, on the left as it always was. */
function Wordmark() {
  return (
    <Link to="/" className="flex items-center">
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
  const { user } = useAuth();
  const { count } = useCart();
  const location = useLocation();

  /* React Router swaps the page but leaves the scroll position alone, so a
     footer link opened from the bottom of one page arrived at the bottom of
     the next. Scroll to the top on every navigation — or to the anchor when
     the link names one, which is how the home page's category chips reach
     /order#cat-N. The anchor may not exist yet if the menu is still loading;
     in that case the top is the right fallback. */
  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    const target = id ? document.getElementById(id) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-dvh flex-col bg-cream-100">
      {/* Clean white sticky app bar */}
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-white/95 pt-safe backdrop-blur">
        {/* Three columns at every size: the name on the left, the logo dead
            centre, the nav on the right (empty on mobile, where the nav is the
            bottom bar). The outer columns are equal so the logo stays centred
            however wide the name or the nav happens to be. */}
        <div className="container-wide grid h-[4.5rem] grid-cols-[1fr_auto_1fr] items-center sm:h-24">
          <Wordmark />
          <Logo />
          <div className="flex justify-end">
            <DesktopNav />
          </div>
        </div>
      </header>

      {/* Page content. The bottom clearance for the fixed nav and cart bar
          lives on the footer alone — it is the last thing on the page, so
          padding here as well only stacked a blank band above it. */}
      <main className="flex-1">
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

      {/* Footer. Shown on phones too: the policy links below have to be
          reachable from every page on every device — a payment gateway checks
          for them, and a customer is entitled to find them. The extra bottom
          padding on small screens clears the fixed bottom nav. */}
      {/* pb-28 on phones clears the bottom nav (56px) plus the cart bar that
          sits above it when the cart is not empty; sm:pb-16 clears the desktop
          cart bar alone. */}
      <footer className="mt-6 border-t border-cream-200 bg-white px-4 pb-28 pt-3 text-sm text-brand-500 sm:pb-16">
        <div className="container-wide">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
            <Link to="/contact" className="link-quiet">Contact Us</Link>
            <Link to="/terms" className="link-quiet">Terms &amp; Conditions</Link>
            <Link to="/privacy" className="link-quiet">Privacy Policy</Link>
            <Link to="/refunds" className="link-quiet">Cancellation &amp; Refund Policy</Link>
            <Link to="/shipping" className="link-quiet">Shipping &amp; Delivery Policy</Link>
          </nav>
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
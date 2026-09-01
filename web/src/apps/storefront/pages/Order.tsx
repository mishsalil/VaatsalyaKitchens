import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useFetch } from '../../shared/hooks/useFetch';
import { menuApi } from '../../shared/api/endpoints';
import { SkeletonMenu } from '../../shared/components/Skeleton';
import { MenuCategory } from '../components/MenuCategory';
import { MenuItemRow } from '../components/MenuItemRow';
import { CategoryTabs, CategoryRail } from '../components/CategoryTabs';
import { CartBar } from '../components/CartBar';
import { PushNudge } from '../../shared/push/PushNudge';

function ErrorBox({ msg }: { msg: string }) {
  return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{msg}</p>;
}

/**
 * Step 1 of the guided order flow — browse the menu by category, add dishes,
 * and review the cart in the slide-up CartSheet. Delivery details, contact and
 * bill live on the focused /checkout step.
 */
export function Order() {
  const { user, settings } = useAuth();
  const menu = useFetch(() => menuApi.get(), []);
  const [query, setQuery] = useState('');

  const items = menu.data?.items ?? [];
  const cats = menu.data?.categories ?? [];
  const visibleCats = useMemo(
    () => cats.filter((c) => items.some((it) => it.category_id === c.id)),
    [cats, items],
  );

  // Searching flattens the menu: with 100+ dishes across 11 categories, someone
  // looking for "paneer" should not have to know which section it lives in.
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : [];

  return (
    <div className="container-wide pt-5 pb-32 sm:pb-24">
      {/* Light header */}
      <div className="px-1">
        <h1 className="text-2xl font-bold text-brand-900">Our Menu</h1>
        <p className="mt-1 text-sm text-brand-500">
          {user ? (
            <>Welcome back, <span className="font-semibold text-brand-700">{user.name.split(' ')[0]}</span> — tap Add on anything you like.</>
          ) : (
            <>Tap <span className="font-semibold text-brand-700">Add</span> on any dish. We will ask for your details at checkout.</>
          )}
        </p>
        {settings && Number(settings.gst_rate) > 0 && (
          <p className="mt-1 text-xs font-medium text-brand-600">
            All prices are exclusive of {Number(settings.gst_rate)}% GST — CGST &amp; SGST are added at checkout.
          </p>
        )}
      </div>

      {/* Search — the fastest path to a dish when you already know its name. */}
      <div className="mt-4 px-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the menu"
            placeholder={items.length ? `Search ${items.length} dishes…` : 'Search the menu…'}
            className="w-full rounded-full border border-cream-300 bg-white py-2.5 pl-10 pr-10 text-sm text-brand-900 placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-400 hover:bg-cream-100 hover:text-brand-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category pills — mobile only; the desktop rail lives in the grid below.
          Rendered as a direct child so its `sticky` is scoped to the whole page,
          not to a wrapper the height of the strip. */}
      {!q && <CategoryTabs categories={visibleCats} />}

      {menu.loading ? (
        <div className="mt-2 space-y-2"><SkeletonMenu rows={6} /></div>
      ) : menu.error ? (
        <div className="mt-2"><ErrorBox msg={menu.error} /></div>
      ) : q ? (
        /* Search results — flat, no category grouping. */
        <div className="mt-4 space-y-3">
          <p className="px-1 text-sm text-brand-500">
            {matches.length === 0
              ? <>No dish matches “<span className="font-semibold text-brand-700">{query}</span>”.</>
              : <>{matches.length} {matches.length === 1 ? 'dish' : 'dishes'} matching “<span className="font-semibold text-brand-700">{query}</span>”</>}
          </p>
          {matches.length > 0 && (
            <div className="divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card">
              {matches.map((it) => (
                <MenuItemRow key={it.id} item={it} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Browse — vertical rail beside the menu from lg up, stacked below. */
        <div className="mt-2 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
          <CategoryRail categories={visibleCats} />
          <div className="min-w-0 space-y-2">
            {visibleCats.map((cat) => {
              const catItems = items.filter((it) => it.category_id === cat.id);
              return (
                <MenuCategory key={cat.id} id={cat.id} name={cat.name}>
                  {catItems.map((it) => (
                    <MenuItemRow key={it.id} item={it} />
                  ))}
                </MenuCategory>
              );
            })}
          </div>
        </div>
      )}

      {/* Push opt-in — surfaced while the user is choosing. */}
      <div className="mt-6">
        <PushNudge surface="order" />
      </div>

      {settings && (
        <p className="mt-6 px-1 text-center text-xs text-brand-400">
          Prices are re-read fresh from our kitchen — what you see is what we charge. Questions? Call{' '}
          <a href={`tel:+${settings.kitchen_whatsapp}`} className="link-quiet font-medium">{settings.kitchen_phone_display}</a>.
        </p>
      )}

      {/* Sticky bottom cart bar → opens CartSheet → /checkout */}
      <CartBar />
    </div>
  );
}
import { useAuth } from '../../shared/hooks/useAuth';
import { useFetch } from '../../shared/hooks/useFetch';
import { menuApi } from '../../shared/api/endpoints';
import { SkeletonMenu } from '../../shared/components/Skeleton';
import { MenuCategory } from '../components/MenuCategory';
import { MenuItemRow } from '../components/MenuItemRow';
import { CategoryTabs } from '../components/CategoryTabs';
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

  const items = menu.data?.items ?? [];
  const cats = menu.data?.categories ?? [];
  const visibleCats = cats.filter((c) => items.some((it) => it.category_id === c.id));

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

      {/* Sticky category pills */}
      <div className="mt-3">
        <CategoryTabs categories={visibleCats} />
      </div>

      {/* Menu */}
      <div className="mt-2 space-y-2">
        {menu.loading ? (
          <SkeletonMenu rows={6} />
        ) : menu.error ? (
          <ErrorBox msg={menu.error} />
        ) : (
          visibleCats.map((cat) => {
            const catItems = items.filter((it) => it.category_id === cat.id);
            return (
              <MenuCategory key={cat.id} id={cat.id} name={cat.name}>
                {catItems.map((it) => (
                  <MenuItemRow key={it.id} item={it} />
                ))}
              </MenuCategory>
            );
          })
        )}
      </div>

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
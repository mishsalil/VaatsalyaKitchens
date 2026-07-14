import { Link } from 'react-router-dom';
import {
  PartyPopper, Coffee, CookingPot, Home as HomeIcon, ArrowRight, Phone, Mail, Clock, MapPin, ShieldCheck, UtensilsCrossed, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useFetch } from '../../shared/hooks/useFetch';
import { menuApi } from '../../shared/api/endpoints';
import { rupees } from '../../shared/lib/format';
import { Button } from '../../shared/components/ui/Button';
import { DishImage } from '../../shared/components/ui/DishImage';
import { useCart } from '../../shared/context/CartContext';
import { PushNudge } from '../../shared/push/PushNudge';

const SERVICES = [
  { icon: PartyPopper, title: 'Small Parties', body: 'Birthdays, anniversaries and family functions for 10–50 guests. Curated veg menus, served hot, right on time.' },
  { icon: Coffee, title: 'Kitty Parties', body: 'Delightful snack platters, chaat counters and light meals that make your kitty the talk of the group.' },
  { icon: CookingPot, title: 'Bulk Food Ordering', body: 'Office lunches, poojas, community events and large gatherings — 50 to 500+ portions with consistent taste.' },
  { icon: HomeIcon, title: 'Daily Home-style Meals', body: 'Simple, wholesome tiffin-style meals when you want ghar ka khana without the effort.' },
];

const STEPS = [
  { title: 'Choose your dishes', body: 'Browse the menu and tap Add on what you like.' },
  { title: 'Tell us the details', body: 'Your name, phone, when and where you need it.' },
  { title: 'We confirm & cook', body: 'We call to confirm, then keep you updated till it reaches you.' },
];

export function Home() {
  const { settings, user } = useAuth();
  const { add } = useCart();
  const menu = useFetch(() => menuApi.get(), []);
  const items = menu.data?.items ?? [];
  const cats = menu.data?.categories ?? [];
  // One-tap Add cards: only items with no variants/add-ons (those need the picker).
  const popular = items.filter((it) => it.variants.length === 0 && it.addons.length === 0).slice(0, 8);

  return (
    <div>
      {/* Hero — light, photo-forward */}
      <section className="bg-cream-50">
        <div className="container-wide grid items-center gap-6 py-8 sm:py-12 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gold-700">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-500" /> Food made with the warmth of home
            </p>
            <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-brand-900 sm:text-5xl">
              <span className="font-devanagari" lang="hi">वात्सल्य</span> Kitchens
            </h1>
            <p className="mt-3 max-w-md text-brand-600">
              Homestyle veg meals for small parties, kitty gatherings and bulk orders — so simple, anyone from 12 to 70+ can order in minutes.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/order">
                <Button size="lg">
                  <UtensilsCrossed className="h-5 w-5" /> Order Now
                </Button>
              </Link>
              <Link to="/order" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900">
                See the menu <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {user && (
              <p className="mt-5 text-sm text-brand-500">
                Welcome back, <span className="font-semibold text-brand-800">{user.name.split(' ')[0]}</span> 👋
              </p>
            )}
          </div>
          {/* Photo cluster */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {popular.slice(0, 3).map((it, i) => (
              <div key={it.id} className={i === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}>
                <DishImage item={it} className="h-full w-full" rounded="rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-wide space-y-10 py-8">
        <PushNudge surface="home" />

        {/* Categories quick-nav */}
        {cats.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-brand-900">Browse by category</h2>
              <Link to="/order" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-900">
                All items <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {cats.map((c) => (
                <Link key={c.id} to={`/order#cat-${c.id}`} className="chip shrink-0">
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Popular dishes */}
        {popular.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-brand-900">Popular this week</h2>
              <Link to="/order" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-900">
                See all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
              {popular.map((it) => (
                <div key={it.id} className="w-40 shrink-0 card-soft overflow-hidden">
                  <DishImage item={it} className="h-32 w-full" rounded="rounded-none" />
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-brand-900">{it.name}</p>
                    <p className="text-xs text-brand-500">{rupees(it.price)} · {it.unit}</p>
                    <button
                      type="button"
                      onClick={() => add({ id: it.id, name: it.name, unit: it.unit, basePrice: it.price, qty: 1 })}
                      className="mt-2 w-full rounded-full border border-brand-900 bg-white py-1 text-xs font-semibold text-brand-900 transition-colors hover:bg-brand-900 hover:text-cream-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Order for */}
        <section>
          <h2 className="px-1 text-lg font-bold text-brand-900">What we cater</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SERVICES.map((s) => (
              <div key={s.title} className="card-soft p-5 transition-transform hover:-translate-y-0.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-bold text-brand-900">{s.title}</h3>
                <p className="mt-1 text-sm text-brand-600">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="card-soft p-5 sm:p-6">
          <h2 className="px-1 text-lg font-bold text-brand-900">Ordering is easy — for every age</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-cream-50">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-brand-900">{s.title}</p>
                  <p className="text-sm text-brand-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Link to="/order">
              <Button size="lg">
                Start your order <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Contact */}
        {settings && (
          <section className="card-soft p-5 sm:p-6">
            <h2 className="text-lg font-bold text-brand-900">Contact us</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-brand-700">
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gold-600" />
                <a href={`tel:+${settings.kitchen_whatsapp}`} className="link-quiet font-medium">{settings.kitchen_phone_display}</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gold-600" />
                <a href={`mailto:${settings.kitchen_email}`} className="link-quiet">{settings.kitchen_email}</a>
              </li>
              <li className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gold-600" /> 8:00 AM – 12:00 midnight, all days
              </li>
              <li className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-gold-600" /> Cloud kitchen — delivery &amp; pickup available
              </li>
            </ul>
          </section>
        )}

        <p className="flex items-center justify-center gap-2 pb-2 text-xs text-brand-400">
          <ShieldCheck className="h-4 w-4" /> We re-read every price from our kitchen — what you see is what we charge.
        </p>
      </div>
    </div>
  );
}
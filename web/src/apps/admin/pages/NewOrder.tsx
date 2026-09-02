import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search, Minus, X, Check, Printer, UserCheck, Gift, MessageCircle, Clock } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useFetch } from '../../shared/hooks/useFetch';
import { adminOrdersApi, type AdminNewOrderLine } from '../api/endpoints';
import { menuApi } from '../../shared/api/endpoints';
import { computeOrderTotal } from '../../shared/lib/gst';
import { defaultNeededOnLocal, formatNeededOn, normalizePhone, rupees } from '../../shared/lib/format';
import { cartKey, type MenuItem } from '../../shared/types';
import { kitchenOpenAt, categoryOpenAt, nextOpenFrom, describeWhen } from '../../shared/lib/hours';
import { Button } from '../../shared/components/ui/Button';
import { CustomerSuggest } from '../components/CustomerSuggest';

/**
 * Counter order entry — the 100-200x/day lane.
 *
 * Everything lives on one screen: customer, menu, cart, billing, save. No steps,
 * no modals, no routing mid-order. One tap on a tile puts the dish in the cart;
 * tapping again increments it. Items with variants are FLATTENED into one tile
 * per variant ("Masala Dosa · Butter") so a rep who knows the menu never opens a
 * picker — the trade is a longer grid for zero interaction depth, which is why
 * the search box above the grid matters.
 *
 * Add-ons stay off the fast path too: a tile always adds the plain dish, and
 * add-ons appear as toggle chips ON THE CART LINE afterwards. Nothing blocks the
 * tap, and a rep who needs "+ Cheese" taps one chip instead of clearing a modal.
 * Toggling re-keys the line (shared cartKey), merging it with a matching line.
 */

interface Tile {
  key: string;
  itemId: number;
  variantId: number;
  variantName: string | null;
  label: string;
  price: number;
  categoryId: number;
}

interface CartEntry {
  itemId: number;
  /** 0 = the item has no variants. */
  variantId: number;
  variantName: string | null;
  addonIds: number[];
  qty: number;
}

export function AdminNewOrder() {
  // Same screen serves /admin/new-order and /admin/orders/:id/edit — an edit is
  // the same decisions as a new order, so a second form would only drift.
  const { id: editIdParam } = useParams();
  const editId = editIdParam ? Number(editIdParam) : null;
  const [loadingOrder, setLoadingOrder] = useState(editId !== null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const { settings } = useAdminAuth();
  // The PUBLIC menu endpoint, not the admin one: /api/admin/menu requires the
  // `menu` cap, which staff — the counter reps this screen exists for — do not
  // have. /api/menu also pre-filters to active categories, available items and
  // available add-ons, which is exactly what should be orderable at the till.
  const menu = useFetch(() => menuApi.get(), []);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  // Prefilled 40 minutes out — the counter's usual answer, still editable.
  const [whenLocal, setWhenLocal] = useState(defaultNeededOnLocal);
  // needed_on is free text on the order ("Sat 20 Jul, 1:00 PM"), which a
  // datetime-local input cannot represent — so edit mode keeps it as text
  // rather than forcing the rep to re-pick a time that is already correct.
  const [whenText, setWhenText] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [known, setKnown] = useState<string | null>(null);

  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [query, setQuery] = useState('');

  const [discountPct, setDiscountPct] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [complimentary, setComplimentary] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: number; total: number; complimentary: boolean } | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimNote, setClaimNote] = useState<string | null>(null);

  const itemById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const it of menu.data?.items ?? []) m.set(it.id, it);
    return m;
  }, [menu.data]);

  // Flatten menu → tiles (one per variant), keeping category order from the API.
  const { tiles, categories } = useMemo(() => {
    const items = menu.data?.items ?? [];
    const cats = menu.data?.categories ?? [];
    const out: Tile[] = [];
    for (const it of items) {
      if (it.variants.length > 0) {
        for (const v of it.variants) {
          out.push({
            key: `${it.id}:${v.id}`,
            itemId: it.id,
            variantId: v.id,
            variantName: v.name,
            label: `${it.name} · ${v.name}`,
            price: it.price + v.price_delta,
            categoryId: it.category_id,
          });
        }
      } else {
        out.push({
          key: `${it.id}:0`, itemId: it.id, variantId: 0, variantName: null,
          label: it.name, price: it.price, categoryId: it.category_id,
        });
      }
    }
    return { tiles: out, categories: cats };
  }, [menu.data]);

  const q = query.trim().toLowerCase();
  const visible = q ? tiles.filter((t) => t.label.toLowerCase().includes(q)) : tiles;

  /* Edit mode: hydrate the form from the order once the menu is in.
     Lines are rebuilt from the menu ids stored on each line, so the cart is
     exactly what was ordered. Orders placed before migration_007 have no ids —
     those fall back to matching on name (as ReorderButton does) and anything
     still unresolvable is reported rather than silently dropped, because a
     missing line would be re-saved as a smaller bill. */
  useEffect(() => {
    if (editId === null || !menu.data) return;
    let cancelled = false;
    adminOrdersApi
      .show(editId)
      .then(({ order }) => {
        if (cancelled) return;
        setName(order.name);
        setPhone(order.phone);
        setWhenText(order.needed_on);
        setAddress(order.address_text ?? '');
        setNotes(order.notes ?? '');
        setDiscountPct(order.discount_pct ? String(order.discount_pct) : '');
        setDeliveryCharge(order.delivery_charge ? String(order.delivery_charge) : '');
        setComplimentary(order.is_complimentary);

        const next: Record<string, CartEntry> = {};
        let unresolved = 0;
        for (const line of order.items) {
          let itemId = line.menu_item_id;
          let variantId = line.variant_id ?? 0;
          let addonIds = line.addon_ids ?? [];
          if (!itemId) {
            const match = (menu.data?.items ?? []).find((m) => m.name === line.item_name);
            if (!match) { unresolved++; continue; }
            itemId = match.id;
            variantId = line.variant_name
              ? match.variants.find((v) => v.name === line.variant_name)?.id ?? 0
              : 0;
            const names = line.addons_text ? line.addons_text.split(',').map((s) => s.trim()) : [];
            addonIds = match.addons.filter((a) => names.includes(a.name)).map((a) => a.id);
          }
          const item = itemById.get(itemId);
          if (!item) { unresolved++; continue; }
          const key = cartKey(itemId, variantId || undefined, addonIds);
          next[key] = {
            itemId,
            variantId,
            variantName: item.variants.find((v) => v.id === variantId)?.name ?? null,
            addonIds,
            qty: line.qty,
          };
        }
        setCart(next);
        if (unresolved > 0) {
          setLoadWarning(
            `${unresolved} line(s) from this order are no longer on the menu and could not be loaded. ` +
            'Re-add them before saving, or the total will drop.',
          );
        }
      })
      .catch((e) => setLoadWarning((e as Error).message))
      .finally(() => { if (!cancelled) setLoadingOrder(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, menu.data]);

  // Known-customer lookup: fires once the phone is a valid 10-digit number.
  useEffect(() => {
    // In edit mode the order already carries its customer; the lookup would
    // only fight the values we just loaded.
    if (editId !== null) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setKnown(null);
      return;
    }
    let cancelled = false;
    adminOrdersApi
      .lookupCustomer(normalized)
      .then(({ customer }) => {
        if (cancelled) return;
        if (!customer) {
          setKnown(null);
          return;
        }
        setKnown(customer.name);
        setName((prev) => (prev.trim() === '' ? customer.name : prev));
        setAddress((prev) => (prev.trim() === '' && customer.address_text ? customer.address_text : prev));
      })
      .catch(() => {
        /* lookup is a convenience — never block order entry on it */
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  /** Fill the whole customer block from one picked suggestion. Address is only
      taken when the field is still empty, so a rep who already typed a
      different delivery address for this order does not lose it. */
  const applyCustomer = (c: { name: string; phone: string; address_text: string | null }) => {
    setName(c.name);
    setPhone(c.phone);
    setKnown(c.name);
    if (c.address_text) setAddress((prev) => (prev.trim() === '' ? c.address_text ?? '' : prev));
  };

  /** Unit price = base + variant delta + selected add-ons. */
  const entryPrice = (e: CartEntry): number => {
    const item = itemById.get(e.itemId);
    if (!item) return 0;
    const variant = item.variants.find((v) => v.id === e.variantId);
    const addons = item.addons.filter((a) => e.addonIds.includes(a.id));
    return item.price + (variant?.price_delta ?? 0) + addons.reduce((s, a) => s + a.price, 0);
  };

  const addTile = (t: Tile) => {
    const key = cartKey(t.itemId, t.variantId || undefined, []);
    setCart((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], qty: prev[key].qty + 1 }
        : { itemId: t.itemId, variantId: t.variantId, variantName: t.variantName, addonIds: [], qty: 1 },
    }));
  };

  const bump = (key: string, by: number) =>
    setCart((prev) => {
      const e = prev[key];
      if (!e) return prev;
      const next = { ...prev };
      const qty = e.qty + by;
      if (qty <= 0) delete next[key];
      else next[key] = { ...e, qty };
      return next;
    });

  /** Toggle one add-on on a cart line, re-keying it (and merging on collision). */
  const toggleAddon = (key: string, addonId: number) =>
    setCart((prev) => {
      const e = prev[key];
      if (!e) return prev;
      const nextAddons = e.addonIds.includes(addonId)
        ? e.addonIds.filter((a) => a !== addonId)
        : [...e.addonIds, addonId].sort((a, b) => a - b);
      const nextKey = cartKey(e.itemId, e.variantId || undefined, nextAddons);
      const next = { ...prev };
      delete next[key];
      next[nextKey] = next[nextKey]
        ? { ...next[nextKey], qty: next[nextKey].qty + e.qty }
        : { ...e, addonIds: nextAddons };
      return next;
    });

  const lines = Object.entries(cart).map(([key, entry]) => ({ key, entry, price: entryPrice(entry) }));
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.entry.qty, 0);
  const bill = computeOrderTotal(
    subtotal,
    settings?.gst_rate,
    Number(discountPct) || 0,
    Number(deliveryCharge) || 0,
    complimentary,
  );

  const reset = () => {
    // Recomputed, not blanked — the next order gets a fresh 40-minutes-from-now,
    // not a stale one from whenever this screen first loaded.
    setPhone(''); setName(''); setWhenLocal(defaultNeededOnLocal()); setAddress(''); setNotes('');
    setKnown(null); setCart({}); setQuery('');
    setDiscountPct(''); setDeliveryCharge(''); setComplimentary(false);
    setError(null); setPlaced(null); setClaimNote(null);
  };

  /**
   * Mint a one-time claim link and hand it to WhatsApp addressed to the
   * customer. Counter customers have no PIN and no session, so without this
   * they cannot track the order the rep just took. The link is built from this
   * origin — the admin and the storefront are the same app — so it points
   * wherever the rep is actually working, with no base-URL config involved.
   */
  const sendClaimLink = async () => {
    if (!placed) return;
    setClaimBusy(true);
    setClaimNote(null);
    try {
      const res = await adminOrdersApi.claimLink(placed.id);
      const url = `${window.location.origin}/claim/${res.token}`;
      const msg = [
        `Namaste ${res.name.split(' ')[0]}! Your Vaatsalya Kitchens order #${placed.id} is confirmed.`,
        '',
        'Track it and see your order history here:',
        url,
        '',
        `This link signs you in once and works for ${res.days} days.`,
      ].join('\n');
      window.open(`https://wa.me/${res.phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      setClaimNote(
        res.has_pin
          ? 'WhatsApp opened. This customer already has a PIN, so they can also just sign in.'
          : 'WhatsApp opened — send the message to give them access.',
      );
    } catch (e) {
      setClaimNote((e as Error).message);
    } finally {
      setClaimBusy(false);
    }
  };

  const neededOn = editId !== null ? whenText.trim() : formatNeededOn(whenLocal);

  /* Opening hours (migration_010) — a WARNING, never a block. The rep can see
     the kitchen and can walk over and ask; refusing an order the kitchen has
     already agreed to would be worse than letting it through. Customers are
     hard-blocked server-side; staff deliberately are not. */
  const hoursWarning = (() => {
    const h = menu.data?.hours;
    if (!h || editId !== null || !whenLocal) return null;
    const when = new Date(whenLocal);
    if (Number.isNaN(when.getTime())) return null;
    if (!kitchenOpenAt(h, when)) {
      const next = nextOpenFrom(h, when);
      return next
        ? `The kitchen is closed then — it next opens ${describeWhen(next, new Date())}.`
        : 'The kitchen is closed at that time.';
    }
    const shut = lines
      .map(({ entry }) => itemById.get(entry.itemId))
      .filter((it): it is MenuItem => !!it)
      .filter((it) => !categoryOpenAt(h, it.category_id, when));
    if (shut.length > 0) {
      const names = [...new Set(shut.map((i) => i.name))];
      return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} ` +
             `${names.length === 1 ? 'is' : 'are'} not usually cooked at that time.`;
    }
    return null;
  })();

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Customer name is required.');
    if (!normalizePhone(phone)) return setError('Enter a valid 10-digit phone number.');
    if (!neededOn) return setError('Set when the food is needed.');
    if (lines.length === 0) return setError('Add at least one dish.');

    const items: AdminNewOrderLine[] = lines.map(({ entry }) => ({
      id: entry.itemId,
      qty: entry.qty,
      ...(entry.variantId ? { variant_id: entry.variantId } : {}),
      ...(entry.addonIds.length ? { addon_ids: entry.addonIds } : {}),
    }));

    const payload = {
      name: name.trim(),
      phone: normalizePhone(phone) as string,
      needed_on: neededOn,
      address_text: address.trim(),
      notes: notes.trim(),
      items,
      discount_pct: Number(discountPct) || 0,
      delivery_charge: Number(deliveryCharge) || 0,
      is_complimentary: complimentary,
    };

    setSaving(true);
    try {
      const res = editId !== null
        ? await adminOrdersApi.update(editId, payload)
        : await adminOrdersApi.create(payload);
      setPlaced({ id: res.order_id, total: res.total, complimentary: res.complimentary });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (placed) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-brand-900">
          Order #{placed.id} {editId !== null ? 'updated' : 'saved'}
        </h1>
        <p className="mt-1 text-brand-600">
          {placed.complimentary ? 'Complimentary — nothing to collect' : `${rupees(placed.total)} · confirmed`}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={`/admin/orders/${placed.id}/print`}>
            <Button variant="outline"><Printer className="h-4 w-4" /> Print slip</Button>
          </Link>
          <Button variant="whatsapp" onClick={sendClaimLink} disabled={claimBusy}>
            <MessageCircle className="h-4 w-4" /> {claimBusy ? 'Preparing…' : 'Send tracking link'}
          </Button>
          {editId !== null
            ? <Link to="/admin/orders"><Button>Back to orders</Button></Link>
            : <Button onClick={reset}>New order</Button>}
        </div>
        {claimNote && <p className="mt-3 text-sm text-brand-500">{claimNote}</p>}
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-brand-900 placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-900">
        {editId !== null ? `Edit order #${editId}` : 'New order'}
      </h1>
      <p className="mt-1 text-sm text-brand-500">
        {editId !== null
          ? 'Change anything — the bill is recalculated and the edit is recorded.'
          : 'Take an order at the counter — tap a dish to add it.'}
      </p>
      {loadingOrder && <p className="mt-3 text-sm text-brand-500">Loading order…</p>}
      {loadWarning && (
        <p className="mt-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          {loadWarning}
        </p>
      )}

      {/* Customer — one compact block, never a separate step. */}
      <div className="card-soft mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <CustomerSuggest
            label="Mobile *"
            value={phone}
            onChange={setPhone}
            onPick={applyCustomer}
            placeholder="Number or name"
            inputMode="numeric"
            className={inputClass}
          />
          {known && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <UserCheck className="h-3.5 w-3.5" /> Known: {known}
            </span>
          )}
        </div>
        <CustomerSuggest
          label="Customer name *"
          value={name}
          onChange={setName}
          onPick={applyCustomer}
          placeholder="Start typing a name"
          className={inputClass}
        />
        <label className="block">
          <span className="text-xs font-semibold text-brand-600">Needed on *</span>
          {editId !== null ? (
            <input
              value={whenText}
              onChange={(e) => setWhenText(e.target.value)}
              placeholder="e.g. Sat 20 Jul, 1:00 PM"
              className={`mt-1 ${inputClass}`}
            />
          ) : (
            <input
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          )}
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-brand-600">Address (blank = pickup)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className="text-xs font-semibold text-brand-600">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Extra spicy, no onion, call before delivery…"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
        {/* Menu grid */}
        <div>
          <div className="sticky top-0 z-10 -mx-1 bg-cream-100 px-1 pb-3 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tiles.length} dishes…`}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {menu.loading && <p className="text-sm text-brand-500">Loading menu…</p>}
          {menu.error && <p className="text-sm text-red-600">{menu.error}</p>}

          {q ? (
            <TileGrid tiles={visible} cart={cart} onAdd={addTile} />
          ) : (
            categories.map((c) => {
              const group = tiles.filter((t) => t.categoryId === c.id);
              if (group.length === 0) return null;
              return (
                <section key={c.id} className="mb-5">
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-500">{c.name}</h2>
                  <TileGrid tiles={group} cart={cart} onAdd={addTile} />
                </section>
              );
            })
          )}
          {q && visible.length === 0 && <p className="text-sm text-brand-500">No dish matches “{query}”.</p>}
        </div>

        {/* Cart — sticky, so the running total is always visible while adding. */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="card-soft p-4">
            <h2 className="text-sm font-bold text-brand-900">Cart ({lines.length})</h2>

            {lines.length === 0 ? (
              <p className="mt-3 text-sm text-brand-400">Tap a dish to start.</p>
            ) : (
              <ul className="mt-3 divide-y divide-cream-200">
                {lines.map(({ key, entry, price }) => {
                  const item = itemById.get(entry.itemId);
                  return (
                    <li key={key} className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-brand-900">
                            {item?.name}
                            {entry.variantName && <span className="text-brand-500"> · {entry.variantName}</span>}
                          </p>
                          <p className="text-xs text-brand-500">{rupees(price * entry.qty)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => bump(key, -1)}
                          aria-label="Remove one"
                          className="rounded-lg border border-cream-300 p-1 text-brand-700 hover:bg-cream-100"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold text-brand-900">{entry.qty}</span>
                        <button
                          type="button"
                          onClick={() => bump(key, 1)}
                          aria-label="Add one"
                          className="rounded-lg border border-cream-300 px-1.5 py-1 text-xs font-bold leading-none text-brand-700 hover:bg-cream-100"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => bump(key, -entry.qty)}
                          aria-label="Remove line"
                          className="rounded-lg p-1 text-brand-400 hover:bg-cream-100 hover:text-brand-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Add-ons: chips on the line, so the tile tap is never blocked. */}
                      {item && item.addons.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.addons.map((a) => {
                              const on = entry.addonIds.includes(a.id);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => toggleAddon(key, a.id)}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                    on
                                      ? 'border-brand-900 bg-brand-900 text-cream-50'
                                      : 'border-cream-300 bg-white text-brand-600 hover:border-brand-300'
                                  }`}
                                >
                                  {on ? '✓ ' : '+ '}{a.name} {rupees(a.price)}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Billing adjustments */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-cream-200 pt-3">
              <label className="block">
                <span className="text-xs font-semibold text-brand-600">Discount %</span>
                <input
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={complimentary}
                  className={`mt-1 ${inputClass} disabled:bg-cream-100 disabled:text-brand-400`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-brand-600">Delivery ₹</span>
                <input
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={complimentary}
                  className={`mt-1 ${inputClass} disabled:bg-cream-100 disabled:text-brand-400`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setComplimentary((v) => !v)}
              className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                complimentary
                  ? 'border-gold-500 bg-gold-100 text-gold-800'
                  : 'border-cream-300 bg-white text-brand-600 hover:bg-cream-50'
              }`}
            >
              <Gift className="h-4 w-4" />
              {complimentary ? 'Complimentary — nothing to collect' : 'Mark complimentary'}
            </button>

            <dl className="mt-3 space-y-1 border-t border-cream-200 pt-3 text-sm">
              <Row label="Subtotal" value={rupees(bill.subtotal)} />
              {bill.discountAmount > 0 && (
                <Row label={`Discount (${bill.discountPct}%)`} value={`− ${rupees(bill.discountAmount)}`} />
              )}
              {!bill.complimentary && bill.rate > 0 && (
                <>
                  <Row label={`CGST (${bill.rate / 2}%)`} value={rupees(bill.cgst)} />
                  <Row label={`SGST (${bill.rate / 2}%)`} value={rupees(bill.sgst)} />
                </>
              )}
              {bill.deliveryCharge > 0 && <Row label="Delivery" value={rupees(bill.deliveryCharge)} />}
              {bill.roundOff !== 0 && <Row label="Round off" value={rupees(bill.roundOff)} />}
              <div className="flex justify-between border-t border-cream-200 pt-2 text-base font-bold text-brand-900">
                <dt>Total</dt>
                <dd>{bill.complimentary ? 'COMPLIMENTARY' : rupees(bill.total)}</dd>
              </div>
            </dl>

            {hoursWarning && (
              <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-800">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{hoursWarning} You can still save it.</span>
              </p>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <Button onClick={save} disabled={saving} fullWidth className="mt-4">
              {saving ? 'Saving…' : 'Save order'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-brand-600">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TileGrid({
  tiles,
  cart,
  onAdd,
}: {
  tiles: Tile[];
  cart: Record<string, CartEntry>;
  onAdd: (t: Tile) => void;
}) {
  // A tile's badge counts every cart line for that item+variant, whatever
  // add-ons were later toggled onto it.
  const countFor = (t: Tile) =>
    Object.values(cart).reduce(
      (n, e) => (e.itemId === t.itemId && e.variantId === t.variantId ? n + e.qty : n),
      0,
    );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => {
        const qty = countFor(t);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onAdd(t)}
            className={`relative rounded-xl border p-2.5 text-left transition-colors ${
              qty > 0
                ? 'border-brand-900 bg-brand-900 text-cream-50'
                : 'border-cream-300 bg-white text-brand-900 hover:border-brand-300 hover:bg-cream-50'
            }`}
          >
            <span className="block text-sm font-medium leading-snug">{t.label}</span>
            <span className={`mt-0.5 block text-xs ${qty > 0 ? 'text-cream-200' : 'text-brand-500'}`}>
              {rupees(t.price)}
            </span>
            {qty > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-xs font-bold text-brand-950">
                {qty}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

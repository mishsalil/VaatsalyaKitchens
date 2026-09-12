import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { ordersApi, addressesApi, menuApi } from '../../shared/api/endpoints';
import { setAuthToken } from '../../shared/api/client';
import { useFetch } from '../../shared/hooks/useFetch';
import { useAuth } from '../../shared/hooks/useAuth';
import { useCart } from '../../shared/context/CartContext';
import { useToast } from '../../shared/context/ToastContext';
import { displayPhone, formatNeededOn, normalizePhone, rupees } from '../../shared/lib/format';
import { Input, Textarea } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import { OccasionSelect } from '../components/OccasionSelect';
import { DatePicker } from '../components/DatePicker';
import { TimePicker } from '../components/TimePicker';
import { kitchenOpenAt, nextOpenFrom, describeWhen } from '../../shared/lib/hours';
import { slotsFor, firstAvailable, toLocalValue } from '../../shared/lib/timeSlots';
import { AddressPicker, type AddressPayload } from '../components/AddressPicker';
import { BillDetails, type BillItem } from '../components/BillDetails';
import { CartLines } from '../components/CartLines';
import { UpsellStrip } from '../components/UpsellStrip';
import { computeGst } from '../../shared/lib/gst';
import { lineLabel, linePrice, variantsText } from '../../shared/types';
import { PushNudge } from '../../shared/push/PushNudge';

/**
 * Step 2 of the guided order flow — a focused checkout. The cart is editable
 * here (steppers + remove on the "Your order" card, one-tap upsells beside the
 * bill); this page collects delivery details + contact and places the order.
 * Empty cart → back to the menu.
 */
export function Checkout() {
  const navigate = useNavigate();
  const { user, settings, refresh } = useAuth();
  const { lines, total, clear } = useCart();
  const toast = useToast();
  const addresses = useFetch(() => (user ? addressesApi.list() : Promise.resolve({ addresses: [] })), [!!user]);
  // Opening hours come with the menu; used to correct the chosen time before
  // submitting rather than bouncing the order back from the server.
  const menu = useFetch(() => menuApi.get(), []);
  const hours = menu.data?.hours;
  // Sections not being cooked right now — the upsell must not offer them.
  const closedIds = hours?.closed_category_ids ?? [];

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user ? displayPhone(user.phone) : '');
  const [occasion, setOccasion] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState<AddressPayload>({ mode: 'pickup' });
  const [submitting, setSubmitting] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [whenErr, setWhenErr] = useState('');
  const [formError, setFormError] = useState('');

  // Prefill name/phone once auth resolves (initial useState ran while user was null).
  useEffect(() => {
    if (user) {
      setName((n) => n || user.name);
      setPhone((p) => p || displayPhone(user.phone));
    }
  }, [user]);

  // Default to the first saved address once the list loads (preserve a deliberate pickup choice).
  useEffect(() => {
    const list = addresses.data?.addresses;
    if (list && list.length > 0 && address.mode === 'pickup') {
      setAddress({ mode: 'saved', address_id: list[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.data]);

  // Preselect the first slot once hours arrive (unconfigured hours resolve immediately).
  // Gated on the menu having loaded so this doesn't seed a day off the default
  // 08:00-22:00 hours before the kitchen's real hours come in.
  useEffect(() => {
    if (!menu.data) return;
    if (date) return;
    const f = firstAvailable(hours, new Date());
    if (f) { setDate(f.date); setTime(f.time); }
  }, [menu.data, hours, date]);
  const whenLocal = date && time ? toLocalValue(date, time) : '';
  const pickDate = (d: string) => {
    setDate(d); setWhenErr('');
    const s = slotsFor(hours, d, new Date());
    if (!s.includes(time)) setTime(s[0] ?? '');
  };

  if (lines.length === 0) {
    return <Navigate to="/order" replace />;
  }

  const billItems: BillItem[] = lines.map((l) => ({
    name: lineLabel(l.name, variantsText(l.variants), l.addons.map((a) => a.name).join(', ') || undefined),
    qty: l.qty,
    unit: l.unit,
    price: linePrice(l),
  }));
  // Tax-exclusive preview — the server recomputes authoritatively on order create.
  const gst = computeGst(total, settings?.gst_rate);
  const grandTotal = gst.total;

  /* Minimum order. Checked against the pre-tax subtotal, which is what the
     server checks, so the two can never disagree about whether a cart
     qualifies. Telling the customer here — and how much more is needed —
     beats letting them fill in the whole form and be refused at the end. */
  const minOrder = Number(settings?.min_order_value ?? 0);
  const belowMinimum = minOrder > 0 && total < minOrder;

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const phoneDigits = normalizePhone(phone);
    let ok = true;
    if (!name.trim()) { setNameErr('Please write your name.'); ok = false; } else setNameErr('');
    if (!phoneDigits) { setPhoneErr('Please write a 10-digit phone number.'); ok = false; } else setPhoneErr('');
    if (!whenLocal) {
      setWhenErr('Please tell us when you need the food.'); ok = false;
    } else if (hours && !kitchenOpenAt(hours, new Date(whenLocal))) {
      // Caught here so the customer is corrected before submitting; the server
      // refuses the same thing regardless.
      const next = nextOpenFrom(hours, new Date(whenLocal));
      setWhenErr(
        next
          ? `We are closed then. The next time we can cook is ${describeWhen(next, new Date())}.`
          : 'We are closed then. Please pick a time during our opening hours.',
      );
      ok = false;
    } else setWhenErr('');
    if (!ok) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phoneDigits!,
        occasion,
        needed_on: formatNeededOn(whenLocal),
        // The raw datetime is what the server validates against opening hours;
        // needed_on stays free text for the slip and the phone call.
        needed_at: whenLocal.replace('T', ' ') + ':00',
        notes: notes.trim(),
        items: lines.map((l) => ({
          id: l.id,
          qty: l.qty,
          variant_ids: l.variants.map((v) => v.id),
          addon_ids: l.addons.map((a) => a.id),
        })),
      };
      if (address.mode === 'saved') body.address_id = address.address_id;
      else if (address.mode === 'new') {
        body.address_text = address.address_text;
        body.lat = address.lat;
        body.lng = address.lng;
      }
      const { order_id, token } = await ordersApi.create(body);
      // Placing the order signs a guest in. Keep the token, or the native app
      // would be "signed in" only by a cookie its WebView never sends.
      setAuthToken(token ?? null);
      clear();
      await refresh(); // guest → logged in
      navigate(`/order-success/${order_id}`);
    } catch (err) {
      setFormError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-wide py-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/order"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-cream-300 text-brand-700 transition-colors hover:bg-cream-100"
          aria-label="Back to menu"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Checkout</h1>
          <p className="text-sm text-brand-500">Review your bill and tell us where to deliver.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_24rem] md:items-start">
        {/* Left: details form. min-w-0 matters: a 1fr grid column defaults to
            min-width:auto, so the map picker's autocomplete element — a web
            component with an intrinsic width — stretched the column and put a
            horizontal scrollbar on the whole page. */}
        <form className="min-w-0 space-y-6" onSubmit={placeOrder}>
          {formError && <FormError message={formError} />}

          {/* Your order — editable here; the last line removed sends them back to the menu. */}
          <section className="card-soft p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Your order</h2>
            <div className="mt-3">
              <CartLines />
            </div>
            <Link to="/order" className="link-quiet mt-4 inline-block text-sm">+ Add more dishes</Link>
          </section>

          {/* On a phone the upsell sits between the cart and the rest of the
              form; on desktop it lives in the right column above the bill. */}
          <div className="md:hidden">
            <UpsellStrip items={menu.data?.items ?? []} categories={menu.data?.categories ?? []} closedCategoryIds={closedIds} />
          </div>

          {/* Delivery */}
          <section className="card-soft p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Delivery</h2>
            <div className="mt-4">
              <Field label={<>Delivery address</>} hint="(leave on pickup for pickup)">
                <AddressPicker addresses={addresses.data?.addresses ?? []} value={address} onChange={setAddress} />
              </Field>
            </div>
          </section>

          {/* When */}
          <section className="card-soft p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">When</h2>
            <div className="mt-4 space-y-4">
              <Field label="Which day?">
                <DatePicker hours={hours} value={date} onChange={pickDate} />
              </Field>
              <Field label="What time?" error={whenErr}>
                <TimePicker hours={hours} date={date} value={time} onChange={(t) => { setTime(t); setWhenErr(''); }} />
              </Field>
            </div>
          </section>

          {/* Contact */}
          <section className="card-soft p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Contact</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="cust-name" error={nameErr}>
                <Input id="cust-name" value={name} invalid={!!nameErr} onChange={(e) => { setName(e.target.value); setNameErr(''); }} placeholder="e.g. Sunita Sharma" autoComplete="name" required />
              </Field>
              <Field label="Phone number" htmlFor="cust-phone" error={phoneErr}>
                <Input id="cust-phone" type="tel" inputMode="numeric" value={phone} invalid={!!phoneErr} onChange={(e) => { setPhone(e.target.value); setPhoneErr(''); }} placeholder="e.g. 98765 43210" autoComplete="tel" required />
              </Field>
            </div>
          </section>

          {/* Anything else */}
          <section className="card-soft p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Anything else</h2>
            <div className="mt-4 space-y-4">
              <Field label={<>What is the occasion?</>} hint="(optional)">
                <OccasionSelect value={occasion} onChange={setOccasion} />
              </Field>
              <Field label={<>Anything else we should know?</>} hint="(less spicy, no onion-garlic, etc.)">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </section>
        </form>

        {/* Right: upsell + bill + place order (sticky on desktop) */}
        <aside className="md:sticky md:top-20 space-y-4">
          <div className="hidden md:block">
            <UpsellStrip items={menu.data?.items ?? []} categories={menu.data?.categories ?? []} closedCategoryIds={closedIds} />
          </div>
          <BillDetails items={billItems} total={grandTotal} gst={gst} />
          {belowMinimum && (
            <p className="rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-brand-700">
              Our minimum order is <strong>{rupees(minOrder)}</strong>. Please add{' '}
              <strong>{rupees(minOrder - total)}</strong> more to your cart.
            </p>
          )}
          <form onSubmit={placeOrder}>
            <Button type="submit" size="lg" fullWidth disabled={submitting || belowMinimum}>
              {submitting ? 'Placing order…' : `Place order · ${rupees(grandTotal)}`}
            </Button>
          </form>
          {settings && (
            <a href={`tel:+${settings.kitchen_whatsapp}`}>
              <Button type="button" variant="ghost" size="sm" fullWidth>
                <Phone className="h-4 w-4" /> Prefer to talk? Call us
              </Button>
            </a>
          )}
          <PushNudge surface="order" />
          <p className="text-center text-xs text-brand-400">
            Need to change dishes?{' '}
            <Link to="/order" className="link-quiet font-medium">Back to menu</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { ordersApi, addressesApi } from '../../shared/api/endpoints';
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
import { DateTimePicker } from '../components/DateTimePicker';
import { AddressPicker, type AddressPayload } from '../components/AddressPicker';
import { BillDetails, type BillItem } from '../components/BillDetails';
import { computeGst } from '../../shared/lib/gst';
import { lineLabel, linePrice } from '../../shared/types';
import { PushNudge } from '../../shared/push/PushNudge';

/**
 * Step 2 of the guided order flow — a focused checkout. The cart is read-only
 * here (edited back on /order via the CartSheet); this page collects delivery
 * details + contact and places the order. Empty cart → back to the menu.
 */
export function Checkout() {
  const navigate = useNavigate();
  const { user, settings, refresh } = useAuth();
  const { lines, total, clear } = useCart();
  const toast = useToast();
  const addresses = useFetch(() => (user ? addressesApi.list() : Promise.resolve({ addresses: [] })), [!!user]);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user ? displayPhone(user.phone) : '');
  const [occasion, setOccasion] = useState('');
  const [whenLocal, setWhenLocal] = useState('');
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

  if (lines.length === 0) {
    return <Navigate to="/order" replace />;
  }

  const billItems: BillItem[] = lines.map((l) => ({
    name: lineLabel(l.name, l.variant?.name, l.addons.map((a) => a.name).join(', ') || undefined),
    qty: l.qty,
    unit: l.unit,
    price: linePrice(l),
  }));
  // Tax-exclusive preview — the server recomputes authoritatively on order create.
  const gst = computeGst(total, settings?.gst_rate);
  const grandTotal = gst.total;

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const phoneDigits = normalizePhone(phone);
    let ok = true;
    if (!name.trim()) { setNameErr('Please write your name.'); ok = false; } else setNameErr('');
    if (!phoneDigits) { setPhoneErr('Please write a 10-digit phone number.'); ok = false; } else setPhoneErr('');
    if (!whenLocal) { setWhenErr('Please tell us when you need the food.'); ok = false; } else setWhenErr('');
    if (!ok) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phoneDigits!,
        occasion,
        needed_on: formatNeededOn(whenLocal),
        notes: notes.trim(),
        items: lines.map((l) => ({
          id: l.id,
          qty: l.qty,
          variant_id: l.variant?.id,
          addon_ids: l.addons.map((a) => a.id),
        })),
      };
      if (address.mode === 'saved') body.address_id = address.address_id;
      else if (address.mode === 'new') {
        body.address_text = address.address_text;
        body.lat = address.lat;
        body.lng = address.lng;
      }
      const { order_id } = await ordersApi.create(body);
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
    <div className="container-page py-5">
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

      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_22rem] sm:items-start">
        {/* Left: details form */}
        <form className="space-y-5" onSubmit={placeOrder}>
          {formError && <FormError message={formError} />}

          {/* Contact */}
          <section className="card-soft p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Contact details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="cust-name" error={nameErr}>
                <Input id="cust-name" value={name} invalid={!!nameErr} onChange={(e) => { setName(e.target.value); setNameErr(''); }} placeholder="e.g. Sunita Sharma" autoComplete="name" required />
              </Field>
              <Field label="Phone number" htmlFor="cust-phone" error={phoneErr}>
                <Input id="cust-phone" type="tel" inputMode="numeric" value={phone} invalid={!!phoneErr} onChange={(e) => { setPhone(e.target.value); setPhoneErr(''); }} placeholder="e.g. 98765 43210" autoComplete="tel" required />
              </Field>
            </div>
          </section>

          {/* Delivery */}
          <section className="card-soft p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Delivery</h2>
            <div className="mt-4 space-y-4">
              <Field label={<>Delivery address</>} hint="(leave on pickup for pickup)">
                <AddressPicker addresses={addresses.data?.addresses ?? []} value={address} onChange={setAddress} />
              </Field>
              <Field label="When do you need the food?" error={whenErr}>
                <DateTimePicker value={whenLocal} onChange={(v) => { setWhenLocal(v); setWhenErr(''); }} />
              </Field>
              <Field label={<>What is the occasion?</>} hint="(optional)">
                <OccasionSelect value={occasion} onChange={setOccasion} />
              </Field>
              <Field label={<>Anything else we should know?</>} hint="(less spicy, no onion-garlic, etc.)">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </section>
        </form>

        {/* Right: bill + place order (sticky on desktop) */}
        <aside className="sm:sticky sm:top-20">
          <div className="space-y-4">
            <BillDetails items={billItems} total={grandTotal} gst={gst} />
            <form onSubmit={placeOrder}>
              <Button type="submit" size="lg" fullWidth disabled={submitting}>
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
          </div>
        </aside>
      </div>
    </div>
  );
}
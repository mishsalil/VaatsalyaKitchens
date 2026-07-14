import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Package, MapPin, Bell, BellOff, BellRing, User } from 'lucide-react';
import { ordersApi, addressesApi } from '../../shared/api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { useAuth } from '../../shared/hooks/useAuth';
import { useToast } from '../../shared/context/ToastContext';
import { usePush } from '../../shared/push/usePush';
import { rupees, displayPhone } from '../../shared/lib/format';
import { lineLabel, type OrderStatus } from '../../shared/types';
import { Button } from '../../shared/components/ui/Button';
import { Field } from '../../shared/components/ui/Field';
import { Textarea, Select } from '../../shared/components/ui/Input';
import { Modal } from '../../shared/components/ui/Modal';
import { Tabs } from '../../shared/components/ui/Tabs';
import { SkeletonRows, Skeleton } from '../../shared/components/Skeleton';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { AddressCard } from '../components/AddressCard';
import { ReorderButton } from '../components/ReorderButton';
import { PinSetup } from '../components/PinSetup';
import { PushNudge } from '../../shared/push/PushNudge';

function ErrorBox({ msg }: { msg: string }) {
  return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>;
}

export function MyAccount() {
  const { user } = useAuth();
  const toast = useToast();
  const orders = useFetch(() => ordersApi.list(), []);
  const addresses = useFetch(() => addressesApi.list(), []);
  const [tab, setTab] = useState('orders');
  const [adding, setAdding] = useState(false);

  const orderCount = orders.data?.orders.length ?? 0;
  const addrCount = addresses.data?.addresses.length ?? 0;

  return (
    <div className="container-page py-6">
      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-900 text-cream-50">
          <User className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brand-900">Namaste, {user?.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-brand-500">{user ? displayPhone(user.phone) : ''}</p>
        </div>
      </div>

      <div className="mt-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'orders', label: 'Orders', icon: <Package className="h-4 w-4" />, count: orderCount },
            { key: 'addresses', label: 'Addresses', icon: <MapPin className="h-4 w-4" />, count: addrCount },
            { key: 'settings', label: 'Settings', icon: <Bell className="h-4 w-4" /> },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'orders' && (
          <section>
            {orders.loading ? (
              <SkeletonRows rows={3} />
            ) : orders.error ? (
              <ErrorBox msg={orders.error} />
            ) : orders.data && orders.data.orders.length > 0 ? (
              <div className="space-y-3">
                {orders.data.orders.map((o) => (
                  <div key={o.id} className="card-soft p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-brand-900">#{o.id}</span>
                        <StatusBadge status={o.status as OrderStatus} />
                      </div>
                      <span className="text-xs text-brand-400">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-brand-600">
                      {o.items.map((it) => `${lineLabel(it.item_name, it.variant_name, it.addons_text)} ×${it.qty}`).join(', ')}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold text-brand-900">{rupees(o.total_estimate)}</span>
                      <ReorderButton order={o} />
                    </div>
                    <p className="mt-1 text-xs text-brand-400">
                      Needed on: {o.needed_on} · {o.address_text ? 'Delivery' : 'Pickup'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card-soft p-6 text-center">
                <p className="text-brand-600">No orders yet.</p>
                <Link to="/order" className="mt-3 inline-block"><Button>Place your first order</Button></Link>
              </div>
            )}
          </section>
        )}

        {tab === 'addresses' && (
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Saved addresses</h2>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {addresses.loading ? (
              <div className="mt-4 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
            ) : addresses.data && addresses.data.addresses.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {addresses.data.addresses.map((a) => (
                  <AddressCard key={a.id} address={a} onChanged={() => addresses.refetch()} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-brand-500">No saved addresses yet. They are saved automatically when you order with delivery.</p>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <section className="space-y-5">
            <PushStatusCard />
            <PinSetup />
          </section>
        )}
      </div>

      {adding && addresses.data && (
        <AddAddressModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            addresses.refetch();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

function PushStatusCard() {
  const { supported, permission, subscribed, ensure, unsubscribe } = usePush();

  if (!supported) {
    return (
      <div className="card-soft p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-brand-900"><BellOff className="h-5 w-5" /> Notifications</h3>
        <p className="mt-1 text-sm text-brand-600">Your browser doesn't support push notifications, but we'll keep you updated by phone.</p>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="card-soft p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-brand-900"><BellOff className="h-5 w-5" /> Notifications are blocked</h3>
        <p className="mt-1 text-sm text-brand-600">
          You've blocked notifications for this site. To get order updates, open your browser's site settings and allow
          notifications for Vaatsalya Kitchens, then reload.
        </p>
      </div>
    );
  }

  if (permission === 'granted' && subscribed) {
    return (
      <div className="card-soft flex items-center justify-between gap-3 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-brand-900"><BellRing className="h-5 w-5 text-gold-600" /> Notifications on</h3>
          <p className="mt-1 text-sm text-brand-600">We'll ping this device when your order is confirmed and on its way.</p>
        </div>
        <Button variant="ghost" onClick={() => unsubscribe().then(() => {})}>Turn off</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PushNudge surface="account" />
      {permission === 'granted' && !subscribed && (
        <Button variant="outline" onClick={() => ensure().then(() => {})}>
          <Bell className="h-4 w-4" /> Re-enable on this device
        </Button>
      )}
    </div>
  );
}

function AddAddressModal({ onClose, onSaved, onError }: { onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [label, setLabel] = useState('Home');
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim()) {
      setTextErr('Please write the address.');
      return;
    }
    setTextErr('');
    setBusy(true);
    try {
      await addressesApi.add({ label: label.trim() || 'Home', address_text: text.trim(), lat: null, lng: null });
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an address"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label" htmlFor="addr-label">
          <Select id="addr-label" value={label} onChange={(e) => setLabel(e.target.value)}>
            <option>Home</option>
            <option>Work</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Address" htmlFor="addr-text" error={textErr}>
          <Textarea id="addr-text" rows={3} value={text} invalid={!!textErr} onChange={(e) => { setText(e.target.value); setTextErr(''); }} placeholder="House no., street, area…" />
        </Field>
      </div>
    </Modal>
  );
}
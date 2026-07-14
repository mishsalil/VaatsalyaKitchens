import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Phone, MapPin, Plus, Pencil, Trash2, Star, KeyRound, Package } from 'lucide-react';
import { Sheet } from '../../shared/components/ui/Sheet';
import { Skeleton } from '../../shared/components/Skeleton';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { Button } from '../../shared/components/ui/Button';
import { Input } from '../../shared/components/ui/Input';
import { useToast } from '../../shared/context/ToastContext';
import { rupees, displayPhone } from '../../shared/lib/format';
import { adminCustomersApi, adminAddressesApi } from '../api/endpoints';
import type { AdminCustomerDetail, AdminAddress } from '../types';
import { AddressFormModal } from './AddressFormModal';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  customerId: number | null;
  onClose: () => void;
  onChanged: () => void;
};

export function CustomerDrawer({ customerId, onClose, onChanged }: Props) {
  const toast = useToast();
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // editable profile
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [addrModal, setAddrModal] = useState<{ address?: AdminAddress } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'customer' | 'address'; id: number; name: string } | null>(null);

  const load = useCallback(() => {
    if (customerId == null) return;
    setLoading(true);
    adminCustomersApi
      .show(customerId)
      .then((d) => {
        setDetail(d);
        setName(d.customer.name);
        setPhone(d.customer.phone);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (customerId == null) {
      setDetail(null);
      return;
    }
    load();
  }, [customerId, load]);

  const saveProfile = async () => {
    if (!detail) return;
    setSavingProfile(true);
    try {
      await adminCustomersApi.update(detail.customer.id, { name: name.trim(), phone: phone.trim() });
      toast.success('Profile updated');
      load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const resetPin = async () => {
    if (!detail) return;
    try {
      await adminCustomersApi.resetPin(detail.customer.id);
      toast.success('PIN reset — customer can set a new one');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const setDefault = async (a: AdminAddress) => {
    try {
      await adminAddressesApi.setDefault(a.id);
      toast.success('Default address updated');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submitAddress = async (data: { label: string; address_text: string; lat: number | null; lng: number | null }) => {
    if (!detail) return;
    if (addrModal?.address) {
      await adminAddressesApi.update(addrModal.address.id, data);
      toast.success('Address updated');
    } else {
      await adminAddressesApi.add(detail.customer.id, data);
      toast.success('Address added');
    }
    load();
  };

  const runConfirm = async () => {
    if (!confirm || !detail) return;
    try {
      if (confirm.kind === 'customer') {
        await adminCustomersApi.delete(detail.customer.id);
        toast.success('Customer deleted');
        onChanged();
        onClose();
      } else {
        await adminAddressesApi.delete(confirm.id);
        toast.success('Address deleted');
        load();
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const open = customerId != null;
  const footer = detail ? (
    <Button variant="danger" onClick={() => setConfirm({ kind: 'customer', id: detail.customer.id, name: detail.customer.name })} fullWidth>
      <Trash2 className="h-4 w-4" /> Delete customer
    </Button>
  ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={detail ? detail.customer.name : 'Customer'} label="Customer details" footer={footer}>
      {loading && !detail ? (
        <div className="space-y-3 p-1">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : detail ? (
        <div className="space-y-4 p-1">
          {/* profile */}
          <Section icon={<Phone className="h-4 w-4" />} title="Profile">
            <div className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone" />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" onClick={saveProfile} disabled={savingProfile}>Save</Button>
                <Button size="sm" variant="outline" onClick={resetPin}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset PIN
                </Button>
                <span className="text-xs text-brand-400">
                  {detail.customer.has_pin ? 'PIN set' : 'no PIN'} · {detail.customer.orders_count} order{detail.customer.orders_count === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </Section>

          {/* addresses */}
          <Section
            icon={<MapPin className="h-4 w-4" />}
            title={`Addresses (${detail.addresses.length})`}
            action={
              <button
                type="button"
                onClick={() => setAddrModal({})}
                className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            }
          >
            {detail.addresses.length === 0 ? (
              <p className="text-sm text-brand-400">No saved addresses.</p>
            ) : (
              <ul className="space-y-2">
                {detail.addresses.map((a) => (
                  <li key={a.id} className="rounded-xl border border-cream-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-900">
                        {a.label}
                        {a.is_default === 1 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold text-gold-800">
                            <Star className="h-2.5 w-2.5" /> Default
                          </span>
                        )}
                      </span>
                      <div className="flex gap-1">
                        {a.is_default !== 1 && (
                          <button
                            type="button"
                            onClick={() => setDefault(a)}
                            className="rounded-lg p-1 text-brand-400 hover:bg-cream-100 hover:text-gold-600"
                            aria-label="Set as default"
                            title="Set as default"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAddrModal({ address: a })}
                          className="rounded-lg p-1 text-brand-500 hover:bg-cream-100"
                          aria-label="Edit address"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ kind: 'address', id: a.id, name: a.label })}
                          className="rounded-lg p-1 text-red-500 hover:bg-red-50"
                          aria-label="Delete address"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-brand-700">{a.address_text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* order history */}
          <Section icon={<Package className="h-4 w-4" />} title={`Recent orders (${detail.orders.length})`}>
            {detail.orders.length === 0 ? (
              <p className="text-sm text-brand-400">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-cream-200 rounded-xl border border-cream-200">
                {detail.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-900">#{o.id} <span className="font-normal text-brand-500">· {o.needed_on}</span></p>
                      <p className="truncate text-xs text-brand-400">{displayPhone(o.phone)} · {new Date(o.created_at).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={o.status} />
                      <span className="text-sm font-bold text-brand-900">{rupees(o.total_estimate)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-brand-500">Could not load this customer.</p>
      )}

      <AddressFormModal
        open={!!addrModal}
        address={addrModal?.address}
        onClose={() => setAddrModal(null)}
        onSubmit={submitAddress}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'customer' ? 'Delete customer' : 'Delete address'}
        message={
          confirm?.kind === 'customer'
            ? `Delete "${confirm?.name}"? Their saved addresses are removed; past orders are kept (unlinked). This cannot be undone.`
            : `Delete the "${confirm?.name}" address?`
        }
        confirmLabel="Delete"
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </Sheet>
  );
}

function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500">{icon} {title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
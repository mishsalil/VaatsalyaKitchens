import { useState } from 'react';
import { Home, Star, Trash2, Check } from 'lucide-react';
import type { Address } from '../../shared/types';
import { addressesApi } from '../../shared/api/endpoints';
import { useToast } from '../../shared/context/ToastContext';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';

interface Props {
  address: Address;
  onChanged: () => void; // refetch list
}

/** Saved address with optimistic default-set + delete (no page reload). */
export function AddressCard({ address, onChanged }: Props) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const isDefault = !!address.is_default;

  const setDefault = async () => {
    if (isDefault) return;
    setBusy(true);
    try {
      await addressesApi.setDefault(address.id);
      await onChanged();
      toast.success('Default address updated.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await addressesApi.remove(address.id);
      await onChanged();
      toast.success('Address removed.');
      setConfirm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`card-soft p-4 ${isDefault ? 'ring-2 ring-brand-500' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Home className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div>
              <p className="flex items-center gap-2 font-medium text-brand-900">
                {address.label}
                {isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800">
                    <Star className="h-3 w-3" /> Default
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-brand-600">{address.address_text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label="Delete address"
            className="text-brand-300 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={setDefault}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
          >
            <Check className="h-4 w-4" /> Set as default
          </button>
        )}
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this address?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p>“{address.label}: {address.address_text}” will be removed from your saved addresses.</p>
      </Modal>
    </>
  );
}
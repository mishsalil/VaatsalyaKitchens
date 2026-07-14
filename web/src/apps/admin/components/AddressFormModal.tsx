import { useEffect, useState } from 'react';
import { Modal } from '../../shared/components/ui/Modal';
import { Field } from '../../shared/components/ui/Field';
import { Input, Textarea } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import type { AdminAddress } from '../types';

type Data = { label: string; address_text: string; lat: number | null; lng: number | null };

type Props = {
  open: boolean;
  onClose: () => void;
  address?: AdminAddress;
  onSubmit: (data: Data) => Promise<void>;
};

/** Add/edit an address. lat/lng are optional (admin may paste maps coords). */
export function AddressFormModal({ open, onClose, address, onSubmit }: Props) {
  const [label, setLabel] = useState('Home');
  const [text, setText] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [textErr, setTextErr] = useState('');
  const [coordsErr, setCoordsErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTextErr(''); setCoordsErr(''); setFormError('');
    setBusy(false);
    setLabel(address?.label ?? 'Home');
    setText(address?.address_text ?? '');
    setLat(address?.lat != null ? String(address.lat) : '');
    setLng(address?.lng != null ? String(address.lng) : '');
  }, [open, address]);

  const submit = async () => {
    setFormError('');
    let ok = true;
    if (!text.trim()) { setTextErr('Please write the address.'); ok = false; } else setTextErr('');
    const latN = lat.trim() === '' ? null : Number(lat);
    const lngN = lng.trim() === '' ? null : Number(lng);
    if ((lat.trim() !== '' && !isFinite(latN as number)) || (lng.trim() !== '' && !isFinite(lngN as number))) {
      setCoordsErr('Coordinates must be numbers, or left blank.');
      ok = false;
    } else setCoordsErr('');
    if (!ok) return;
    setBusy(true);
    try {
      await onSubmit({ label: label.trim() || 'Home', address_text: text.trim(), lat: latN, lng: lngN });
      onClose();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={address ? 'Edit address' : 'Add address'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{address ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {formError && <FormError message={formError} />}
        <Field label="Label" htmlFor="addr-label">
          <Input id="addr-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home / Office" />
        </Field>
        <Field label="Address" htmlFor="addr-text" error={textErr}>
          <Textarea id="addr-text" rows={3} value={text} invalid={!!textErr} onChange={(e) => { setText(e.target.value); setTextErr(''); }} placeholder="Flat, street, area, city…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" htmlFor="addr-lat" hint="optional" error={coordsErr}>
            <Input id="addr-lat" inputMode="decimal" value={lat} invalid={!!coordsErr} onChange={(e) => { setLat(e.target.value); setCoordsErr(''); }} placeholder="12.9716" />
          </Field>
          <Field label="Longitude" htmlFor="addr-lng" hint="optional">
            <Input id="addr-lng" inputMode="decimal" value={lng} invalid={!!coordsErr} onChange={(e) => { setLng(e.target.value); setCoordsErr(''); }} placeholder="77.5946" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
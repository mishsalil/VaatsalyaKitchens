import { useState, type ReactNode } from 'react';
import { MapPin, Store, Plus, Navigation } from 'lucide-react';
import type { Address } from '../../shared/types';
import { useGeolocation } from '../../shared/hooks/useGeolocation';
import { Textarea } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';

export type AddressPayload =
  | { mode: 'pickup' }
  | { mode: 'saved'; address_id: number }
  | { mode: 'new'; address_text: string; lat: number | null; lng: number | null };

interface Props {
  addresses: Address[];
  value: AddressPayload;
  onChange: (payload: AddressPayload) => void;
}

/**
 * Controlled delivery-address chooser: pickup, a saved address, or a new one
 * (with browser geolocation + Nominatim reverse geocoding). Driven by `value`
 * so the parent (Order) owns the default (e.g. first saved address). The new-
 * address textarea text is kept locally and reported up on each keystroke so
 * /api/orders/create gets the right shape (address_id vs. address_text).
 */
export function AddressPicker({ addresses, value, onChange }: Props) {
  const hasSaved = addresses.length > 0;
  const mode = value.mode;
  const savedId = mode === 'saved' ? value.address_id : 0;

  // New-address text/coords live here; reported up as the user types.
  const [addressText, setAddressText] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const { locate, status, locating } = useGeolocation();

  const pickSaved = (id: number) => onChange({ mode: 'saved', address_id: id });

  const onTextChange = (text: string) => {
    setAddressText(text);
    onChange({ mode: 'new', address_text: text, lat: coords.lat, lng: coords.lng });
  };

  const onLocate = async () => {
    try {
      const res = await locate();
      const lat = parseFloat(res.lat);
      const lng = parseFloat(res.lng);
      setCoords({ lat, lng });
      setAddressText(res.address);
      onChange({ mode: 'new', address_text: res.address, lat, lng });
    } catch {
      /* status already set by the hook */
    }
  };

  const radio = (icon: ReactNode, label: ReactNode, active: boolean, onPick: () => void) => (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
        active ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white hover:border-brand-300'
      }`}
    >
      <input type="radio" name="address_choice" checked={active} onChange={onPick} className="accent-brand-900" />
      <span className="flex items-center gap-2 text-brand-800">{icon}{label}</span>
    </label>
  );

  return (
    <div className="space-y-3">
      {hasSaved && (
        <div className="space-y-2">
          {addresses.map((a) =>
            radio(
              <MapPin className="h-4 w-4" />,
              <span><strong>{a.label}:</strong> {a.address_text}</span>,
              mode === 'saved' && savedId === a.id,
              () => pickSaved(a.id)
            )
          )}
        </div>
      )}

      {radio(<Plus className="h-4 w-4" />, <span>Use a different address</span>, mode === 'new', () => onChange({ mode: 'new', address_text: addressText, lat: coords.lat, lng: coords.lng }))}
      {radio(<Store className="h-4 w-4" />, <span>No delivery — I will pick up</span>, mode === 'pickup', () => onChange({ mode: 'pickup' }))}

      {mode === 'new' && (
        <div className="space-y-3 rounded-xl border border-cream-200 bg-cream-50 p-4">
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-brand-800 disabled:opacity-60"
          >
            <Navigation className="h-4 w-4" /> {locating ? 'Finding location…' : 'Use my current location'}
          </button>
          {status && <p className="text-xs text-brand-500" aria-live="polite">{status}</p>}
          <Field label="Address">
            <Textarea rows={3} placeholder="House no., street, area…" value={addressText} onChange={(e) => onTextChange(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
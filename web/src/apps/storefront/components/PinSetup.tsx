import { useState } from 'react';
import { KeyRound, AlertCircle } from 'lucide-react';
import { accountApi } from '../../shared/api/endpoints';
import { useToast } from '../../shared/context/ToastContext';
import { useAuth } from '../../shared/hooks/useAuth';
import { Input } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';

/**
 * Set the 4-digit PIN that lets the customer sign in from another device.
 *
 * `prominent` is the gate shown straight after an order or a claim link: a
 * stronger heading, no "optional", and a "Skip for now" that calls `onSkip`.
 * A hard block would lose customers who have just paid; a gate they must
 * actively skip, plus the reminder on Home until it is set, gets nearly the
 * same result without the resentment. `onSaved` fires after a successful save.
 */
export function PinSetup({ prominent = false, onSkip, onSaved }: { prominent?: boolean; onSkip?: () => void; onSaved?: () => void } = {}) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* Once a PIN exists the form hides behind "Change PIN". The signed-in device
     is the authorisation — the same as setting it the first time. */
  const [changing, setChanging] = useState(false);

  if (user?.has_pin && !changing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-brand-600">
          <KeyRound className="h-4 w-4 text-gold-600" /> A sign-in PIN is set on your account.
        </p>
        <Button variant="outline" size="sm" onClick={() => setChanging(true)}>Change PIN</Button>
      </div>
    );
  }

  const save = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setErr('The PIN must be exactly 4 digits.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await accountApi.setPin(pin);
      await refresh();
      setPin('');
      toast.success('PIN saved — you can now sign in from any device with your phone number.');
      setChanging(false);
      onSaved?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={prominent ? 'rounded-2xl border-2 border-gold-400 bg-white p-5 shadow-card' : 'card-soft p-5'}>
      <h3 className="flex items-center gap-2 text-lg font-bold text-brand-900">
        <KeyRound className="h-5 w-5 text-gold-600" /> {changing ? 'Change your PIN' : prominent ? 'One more thing — set your PIN' : 'Set a 4-digit PIN'}
        {!prominent && !changing && <span className="text-sm font-normal text-brand-400">(optional, 10 seconds)</span>}
      </h3>
      <p className="mt-1 text-sm text-brand-600">
        {changing
          ? 'Enter a new 4-digit PIN. It replaces the old one straight away.'
          : prominent
            ? 'Four digits, ten seconds. It lets you sign in from any phone with just your number — to track this order, reorder in two taps, and see your history.'
            : 'We already remember you on this phone. A PIN lets you sign in from any other device with just your phone number — to reorder in two taps and see your order history.'}
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex-1">
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="4 digits, e.g. 2810"
            autoComplete="new-password"
            value={pin}
            invalid={!!err}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }}
            aria-label="4-digit PIN"
          />
          {err ? (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{err}</span>
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={busy || pin.length !== 4}>
          {busy ? 'Saving…' : 'Save PIN'}
        </Button>
        {changing && (
          <Button type="button" variant="ghost" onClick={() => { setChanging(false); setPin(''); setErr(''); }}>
            Cancel
          </Button>
        )}
      </form>
      {prominent && onSkip && (
        <button type="button" onClick={onSkip} className="mt-3 text-xs text-brand-400 hover:underline">
          Skip for now
        </button>
      )}
    </div>
  );
}
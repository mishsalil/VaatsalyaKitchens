import { useState } from 'react';
import { KeyRound, AlertCircle } from 'lucide-react';
import { accountApi } from '../../shared/api/endpoints';
import { useToast } from '../../shared/context/ToastContext';
import { useAuth } from '../../shared/hooks/useAuth';
import { Input } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';

/** Set or change the 4-digit PIN that lets the customer sign in from another device. */
export function PinSetup() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.has_pin) {
    return (
      <p className="flex items-center gap-2 text-sm text-brand-600">
        <KeyRound className="h-4 w-4 text-gold-600" /> A sign-in PIN is set on your account.
      </p>
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
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-soft p-5">
      <h3 className="flex items-center gap-2 text-lg font-bold text-brand-900">
        <KeyRound className="h-5 w-5 text-gold-600" /> Set a 4-digit PIN
        <span className="text-sm font-normal text-brand-400">(optional, 10 seconds)</span>
      </h3>
      <p className="mt-1 text-sm text-brand-600">
        We already remember you on this phone. A PIN lets you sign in from any other device with just your phone
        number — to reorder in two taps and see your order history.
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
      </form>
    </div>
  );
}
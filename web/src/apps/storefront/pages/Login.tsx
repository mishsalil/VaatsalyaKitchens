import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { LogIn, Phone, KeyRound } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { useToast } from '../../shared/context/ToastContext';
import { normalizePhone } from '../../shared/lib/format';
import { Input } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import { PushNudge } from '../../shared/push/PushNudge';

export function Login() {
  const { login, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/account';

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in — no need to stay here.
  if (user) {
    return <Navigate to={from} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const digits = normalizePhone(phone);
    let ok = true;
    if (!digits) {
      setPhoneErr('Please enter a 10-digit phone number.');
      ok = false;
    } else setPhoneErr('');
    if (!/^\d{4}$/.test(pin)) {
      setPinErr('Please enter your 4-digit PIN.');
      ok = false;
    } else setPinErr('');
    if (!ok) return;
    setBusy(true);
    try {
      await login(digits!, pin);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (err) {
      const msg = (err as Error).message || 'Could not sign in.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page flex min-h-[60vh] flex-col justify-center py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-900 text-cream-50">
            <LogIn className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-brand-900">Sign in</h1>
          <p className="mt-1 text-sm text-brand-600">Use the phone number and PIN you set earlier.</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {formError && <FormError message={formError} />}
          <Field label="Phone number" htmlFor="login-phone" error={phoneErr}>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
              <Input id="login-phone" type="tel" inputMode="numeric" placeholder="98765 43210" autoComplete="tel" value={phone} invalid={!!phoneErr} onChange={(e) => { setPhone(e.target.value); setPhoneErr(''); }} className="pl-10" required />
            </div>
          </Field>
          <Field label="4-digit PIN" htmlFor="login-pin" error={pinErr}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
              <Input id="login-pin" type="password" inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="current-password" value={pin} invalid={!!pinErr} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinErr(''); }} className="pl-10" required />
            </div>
          </Field>
          <Button type="submit" size="lg" fullWidth disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-600">
          No PIN yet?{' '}
          <Link to="/order" className="link-quiet font-medium">Place an order first</Link>
          {' '}— you can set a PIN afterwards.
        </p>

        <div className="mt-6">
          <PushNudge surface="account" variant="compact" />
        </div>

        {/* The staff way in. On the web this is a convenience — anyone can type
            /admin — but in the Android app it is the ONLY route: there is no
            address bar, and nothing else links to the admin area, so without
            this a shipped app has no way for a rep to sign in at all.

            Deliberately quiet. Customers open this app constantly and will
            never use this; staff need to find it once and then stay signed in
            for thirty days. It earns a line of small text, not a tab. */}
        <div className="mt-10 border-t border-cream-200 pt-4 text-center">
          <Link
            to="/admin"
            className="text-xs font-medium text-brand-400 transition-colors hover:text-brand-700"
          >
            Staff sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
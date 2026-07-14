import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ShieldCheck, User, KeyRound } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { Input } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';
import { FormError } from '../../shared/components/ui/FormError';

export function AdminLogin() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userErr, setUserErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in — go straight to the dashboard.
  if (admin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    let ok = true;
    if (!username.trim()) { setUserErr('Please enter your username.'); ok = false; } else setUserErr('');
    if (!password) { setPassErr('Please enter your password.'); ok = false; } else setPassErr('');
    if (!ok) return;
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setFormError((err as Error).message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900 text-cream-50">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-brand-900">
            <span className="font-devanagari" lang="hi">वात्सल्य</span> Kitchens · Admin
          </h1>
          <p className="mt-1 text-sm text-brand-500">Sign in to manage orders and menu.</p>
        </div>

        <form className="mt-6 card-soft space-y-4 p-5" onSubmit={submit}>
          {formError && <FormError message={formError} />}
          <Field label="Username" htmlFor="admin-user" error={userErr}>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
              <Input
                id="admin-user"
                type="text"
                autoComplete="username"
                value={username}
                invalid={!!userErr}
                onChange={(e) => { setUsername(e.target.value); setUserErr(''); }}
                className="pl-10"
                required
              />
            </div>
          </Field>
          <Field label="Password" htmlFor="admin-pass" error={passErr}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
              <Input
                id="admin-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                invalid={!!passErr}
                onChange={(e) => { setPassword(e.target.value); setPassErr(''); }}
                className="pl-10"
                required
              />
            </div>
          </Field>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-900 px-4 py-3 text-sm font-semibold text-cream-50 transition-all hover:bg-brand-800 hover:shadow-lift disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
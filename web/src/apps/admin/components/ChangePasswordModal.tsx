import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Field } from '../../shared/components/ui/Field';
import { Input } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import { useToast } from '../../shared/context/ToastContext';
import { adminSettingsApi } from '../api/endpoints';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Self-service "change my password" modal, available to every signed-in admin
 * (including roles without the `settings` cap). Uses the self-service
 * settings/change_password endpoint, which verifies the current password and
 * updates the caller's own row — no capability required server-side.
 */
export function ChangePasswordModal({ open, onClose }: Props) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [curErr, setCurErr] = useState('');
  const [nextErr, setNextErr] = useState('');
  const [cfmErr, setCfmErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCur(''); setNext(''); setConfirm('');
    setCurErr(''); setNextErr(''); setCfmErr(''); setFormError('');
    setBusy(false);
  }, [open]);

  const submit = async () => {
    setFormError('');
    let ok = true;
    if (!cur) { setCurErr('Please enter your current password.'); ok = false; } else setCurErr('');
    if (next.length < 8) { setNextErr('New password must be at least 8 characters.'); ok = false; } else setNextErr('');
    if (next !== confirm) { setCfmErr('The new passwords do not match.'); ok = false; } else setCfmErr('');
    if (!ok) return;
    setBusy(true);
    try {
      await adminSettingsApi.changePassword(cur, next);
      toast.success('Password changed');
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
      title="Change password"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !cur || !next}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update password
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {formError && <FormError message={formError} />}
        <Field label="Current password" htmlFor="cp-cur" error={curErr}>
          <Input id="cp-cur" type="password" value={cur} invalid={!!curErr} onChange={(e) => { setCur(e.target.value); setCurErr(''); }} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="cp-new" hint="min 8 chars" error={nextErr}>
          <Input id="cp-new" type="password" value={next} invalid={!!nextErr} onChange={(e) => { setNext(e.target.value); setNextErr(''); setCfmErr(''); }} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="cp-cfm" error={cfmErr}>
          <Input id="cp-cfm" type="password" value={confirm} invalid={!!cfmErr} onChange={(e) => { setConfirm(e.target.value); setCfmErr(''); }} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}
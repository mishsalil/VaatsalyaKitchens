import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { PinSetup } from './PinSetup';

/**
 * Follows a signed-in customer who skipped the PIN gate: a one-line reminder
 * on Home that unfolds into the form on tap. Renders nothing once a PIN is set
 * — `user.has_pin` flips after save via refresh() — and nothing when signed out.
 */
export function PinReminder() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || user.has_pin) return null;

  if (open) return <PinSetup prominent onSkip={() => setOpen(false)} />;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-3 rounded-xl border border-gold-300 bg-gold-50 p-4 text-left"
    >
      <KeyRound className="h-5 w-5 shrink-0 text-gold-700" />
      <span className="flex-1 text-sm text-brand-800">
        Your account has no PIN yet. <span className="font-semibold">Set one in 10 seconds</span> to sign in from any phone.
      </span>
    </button>
  );
}

import { useEffect, useState } from 'react';
import { UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import { adminTeamApi } from '../api/endpoints';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { Skeleton } from '../../shared/components/Skeleton';
import { Button } from '../../shared/components/ui/Button';
import { Field } from '../../shared/components/ui/Field';
import { Input, Select } from '../../shared/components/ui/Input';
import { Modal } from '../../shared/components/ui/Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { ROLES, ROLE_LABELS, roleLabel } from '../rbac';
import type { AdminTeamUser } from '../types';

/**
 * Super-only team / role management. Lists admin users (never password hashes),
 * lets Super add a user, change a role, reset a password, or delete — with the
 * server guarding self-delete and the last-super rule. Non-super roles never
 * reach this UI (route + nav are cap-gated) and the server 403s them anyway.
 */
export function TeamManager() {
  const { admin: me } = useAdminAuth();
  const toast = useToast();
  const { data, loading, error, refetch } = useFetch(() => adminTeamApi.list(), []);
  const users = data?.users ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminTeamUser | null>(null);
  const [pwTarget, setPwTarget] = useState<AdminTeamUser | null>(null);
  const [delTarget, setDelTarget] = useState<AdminTeamUser | null>(null);

  const reload = () => { refetch(); };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Team</h1>
          <p className="text-sm text-brand-500">Create admin users and assign roles. Only Super can manage the team.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" /> Add user
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card">
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <p className="px-4 py-3 text-sm text-red-700">{error}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-brand-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Username</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-brand-900">{u.username}</span>
                    {me && u.id === me.id && <span className="ml-2 text-[10px] font-semibold uppercase text-brand-300">you</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-brand-400 sm:table-cell">
                    {new Date(u.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setRoleTarget(u)} className="rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100">Role</button>
                      <button type="button" onClick={() => setPwTarget(u)} className="rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100">Reset pw</button>
                      <button
                        type="button"
                        disabled={!!me && u.id === me.id}
                        onClick={() => setDelTarget(u)}
                        className="rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={reload} />
      <RoleModal target={roleTarget} onClose={() => setRoleTarget(null)} onSaved={reload} />
      <ResetPasswordModal target={pwTarget} onClose={() => setPwTarget(null)} onSaved={reload} />
      <ConfirmDialog
        open={!!delTarget}
        title="Delete user"
        message={`Delete ${delTarget?.username}? They will lose admin access immediately.`}
        confirmLabel="Delete"
        onClose={() => setDelTarget(null)}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await adminTeamApi.delete(delTarget.id);
            toast.success(`${delTarget.username} deleted`);
            reload();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function AddUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('staff');
  const [userErr, setUserErr] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(''); setPassword(''); setRole('staff');
    setUserErr(''); setPwErr('');
    setBusy(false);
  }, [open]);

  const submit = async () => {
    let ok = true;
    if (!username.trim()) { setUserErr('Please enter a username.'); ok = false; } else setUserErr('');
    if (password.length < 8) { setPwErr('Password must be at least 8 characters.'); ok = false; } else setPwErr('');
    if (!ok) return;
    setBusy(true);
    try {
      await adminTeamApi.add({ username: username.trim(), password, role });
      toast.success(`${username.trim()} added as ${roleLabel(role)}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add admin user"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Username" htmlFor="tu-name" error={userErr}>
          <Input id="tu-name" value={username} invalid={!!userErr} onChange={(e) => { setUsername(e.target.value); setUserErr(''); }} />
        </Field>
        <Field label="Password" htmlFor="tu-pw" hint="min 8 chars" error={pwErr}>
          <Input id="tu-pw" type="password" value={password} invalid={!!pwErr} onChange={(e) => { setPassword(e.target.value); setPwErr(''); }} autoComplete="new-password" />
        </Field>
        <Field label="Role" htmlFor="tu-role">
          <Select id="tu-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function RoleModal({ target, onClose, onSaved }: { target: AdminTeamUser | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setRole(target.role); setBusy(false); }
  }, [target]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await adminTeamApi.updateRole(target.id, role);
      toast.success(`${target.username} is now ${roleLabel(role)}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={`Change role — ${target?.username ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </>
      }
    >
      <Field label="Role" htmlFor="rm-role">
        <Select id="rm-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
      </Field>
      {target?.role === 'super' && role !== 'super' && (
        <p className="mt-2 text-xs text-red-600">Demoting the last Super is not allowed.</p>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose, onSaved }: { target: AdminTeamUser | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [next, setNext] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setNext(''); setPwErr(''); setBusy(false); }
  }, [target]);

  const submit = async () => {
    if (!target) return;
    if (next.length < 8) {
      setPwErr('Password must be at least 8 characters.');
      return;
    }
    setPwErr('');
    setBusy(true);
    try {
      await adminTeamApi.resetPassword(target.id, next);
      toast.success(`Password reset for ${target.username}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={`Reset password — ${target?.username ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || next.length < 8}>Reset</Button>
        </>
      }
    >
      <Field label="New password" htmlFor="rp-pw" hint="min 8 chars" error={pwErr}>
        <Input id="rp-pw" type="password" value={next} invalid={!!pwErr} onChange={(e) => { setNext(e.target.value); setPwErr(''); }} autoComplete="new-password" />
      </Field>
      <p className="mt-2 text-xs text-brand-400">Share this password with the user securely. They can change it later from the sidebar.</p>
    </Modal>
  );
}
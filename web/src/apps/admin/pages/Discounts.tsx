import { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { adminDiscountsApi } from '../api/endpoints';
import type { AdminDiscountCode, AdminDiscountsPayload } from '../types';
import { useFetch } from '../../shared/hooks/useFetch';
import { SkeletonRows } from '../../shared/components/Skeleton';
import { useToast } from '../../shared/context/ToastContext';
import { rupees } from '../../shared/lib/format';
import { offerText, DISCOUNT_CEILING_PCT } from '../../shared/lib/discounts';

const CODE_RE = /^[A-Z0-9]{3,12}$/;

function usageText(c: AdminDiscountCode): string {
  return `used ${c.uses} ${c.uses === 1 ? 'time' : 'times'} · ${rupees(c.given)} given`;
}

function CodeCard({
  row,
  onChange,
}: {
  row: AdminDiscountCode;
  onChange: (next: AdminDiscountsPayload) => void;
}) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(row.code);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(row.code);
      toast.success(`${row.code} copied.`);
    } catch {
      toast.error('Could not copy — select the code and copy it by hand.');
    }
  }

  async function toggleActive(active: boolean) {
    setBusy(true);
    try {
      onChange(await adminDiscountsApi.setActive(row.id, active));
      toast.info(active ? `${row.code} is on.` : `${row.code} is off.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    const code = draft.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      setRenameError('A code is 3–12 letters or digits.');
      return;
    }
    if (code === row.code) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setRenameError(null);
    try {
      onChange(await adminDiscountsApi.rename(row.id, code));
      setRenaming(false);
      toast.success(`Renamed to ${code}.`);
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startRename() {
    setDraft(row.code);
    setRenameError(null);
    setRenaming(true);
  }

  return (
    <li className="rounded-2xl border border-cream-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold text-brand-900">{row.code}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded-lg border border-cream-300 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={row.active}
            disabled={busy}
            onChange={(e) => void toggleActive(e.target.checked)}
          />
          Active
        </label>
      </div>

      <p className="mt-2 text-sm text-brand-800">{offerText(row)}</p>
      <p className="mt-1 text-xs text-brand-500">{usageText(row)}</p>

      <div className="mt-3">
        {renaming ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={draft}
                maxLength={12}
                autoFocus
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                className="w-40 rounded-lg border border-cream-300 px-3 py-1.5 font-mono text-sm uppercase text-brand-900 focus:border-brand-500 focus:outline-none"
                aria-label="New code"
              />
              <button
                type="button"
                onClick={() => void saveRename()}
                disabled={busy}
                className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-semibold text-cream-50 hover:bg-brand-800 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                disabled={busy}
                className="rounded-lg border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {renameError && <p className="mt-2 text-xs text-red-700">{renameError}</p>}
            <p className="mt-2 text-xs text-brand-500">Renaming starts the count again — past orders keep the old name.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRename}
            className="rounded-lg border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100"
          >
            Rename
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The three discount codes and the budget that sizes them. Codes are generated
 * by the server from the budget; here they are only renamed, switched on or off,
 * copied for a message, and watched.
 */
export function AdminDiscounts() {
  const toast = useToast();
  const { data, loading, error } = useFetch(() => adminDiscountsApi.get(), []);

  // Every mutation returns the whole payload, so keep a local copy that the
  // responses replace instead of refetching after each click.
  const [payload, setPayload] = useState<AdminDiscountsPayload | null>(null);
  useEffect(() => { setPayload(data); }, [data]);

  const [budgetDraft, setBudgetDraft] = useState('');
  useEffect(() => { if (data) setBudgetDraft(String(data.budget_pct)); }, [data]);

  const [saving, setSaving] = useState(false);
  const [regenerated, setRegenerated] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const codes = payload?.codes ?? [];
  const active = codes.filter((c) => c.active);
  const inactive = codes.filter((c) => !c.active);

  function applyRegenerated(next: AdminDiscountsPayload) {
    setPayload(next);
    setRegenerated(next.codes.filter((c) => c.active).map((c) => c.code).join(', '));
  }

  async function saveBudget() {
    const pct = Number(budgetDraft);
    if (!Number.isFinite(pct) || pct < 0 || pct > DISCOUNT_CEILING_PCT) {
      setActionError(`The budget is 0–${DISCOUNT_CEILING_PCT} % of sales.`);
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      applyRegenerated(await adminDiscountsApi.setBudget(pct));
      toast.success('Budget saved.');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setSaving(true);
    setActionError(null);
    try {
      applyRegenerated(await adminDiscountsApi.regenerate());
      toast.success('Codes regenerated.');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Discounts</h1>
          <p className="text-sm text-brand-500">The budget sizes the codes; the codes are what customers type.</p>
        </div>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={saving || !payload}
          className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-cream-100 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Regenerate now
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {actionError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}

      {loading && !data ? (
        <div className="mt-4"><SkeletonRows rows={4} /></div>
      ) : payload ? (
        <>
          <section className="mt-4 rounded-2xl border border-cream-200 bg-white p-4 shadow-card">
            <label htmlFor="discount-budget" className="block text-sm font-semibold text-brand-900">
              Discount budget (% of sales)
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="discount-budget"
                type="number"
                min={0}
                max={DISCOUNT_CEILING_PCT}
                step={1}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveBudget(); }}
                className="w-24 rounded-lg border border-cream-300 px-3 py-1.5 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void saveBudget()}
                disabled={saving}
                className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-semibold text-cream-50 hover:bg-brand-800 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-brand-500">
              Regenerate switches every code back on and refreshes VK&lt;n&gt; from the budget; WELCOME and FEAST keep their names.
            </p>
            {regenerated !== null && (
              <p className="mt-2 text-sm text-green-700">Codes regenerated: {regenerated}</p>
            )}
          </section>

          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Codes</h2>
            {active.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-cream-200 bg-white px-4 py-8 text-center text-sm text-brand-400">
                No active codes.
              </p>
            ) : (
              <ul className="mt-2 space-y-3">
                {active.map((c) => (
                  <CodeCard key={c.id} row={c} onChange={setPayload} />
                ))}
              </ul>
            )}
          </section>

          {inactive.length > 0 && (
            <details className="mt-4 rounded-2xl border border-cream-200 bg-white p-4 shadow-card">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                Inactive codes ({inactive.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {inactive.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-mono font-semibold text-brand-700">{c.code}</span>
                    <span className="text-xs text-brand-500">{usageText(c)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : null}
    </div>
  );
}

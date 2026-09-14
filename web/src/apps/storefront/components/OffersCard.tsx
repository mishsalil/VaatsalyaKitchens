import { useEffect, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { discountsApi } from '../../shared/api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { offerText } from '../../shared/lib/discounts';
import { rupees } from '../../shared/lib/format';
import { Input } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';

export interface AppliedCode { code: string; pct: number; amount: number }

/**
 * "Offers for you": the active codes as tappable chips plus a box for a code
 * the customer already has. The server decides what a code is worth; this
 * only asks. When the cart changes under an applied code it is re-checked and
 * dropped with a toast if it no longer qualifies.
 */
export function OffersCard({ subtotal, phone, applied, onApply, onRemove }: {
  subtotal: number; phone: string; applied: AppliedCode | null;
  onApply: (a: AppliedCode) => void; onRemove: () => void;
}) {
  const offers = useFetch(() => discountsApi.list(), []);
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Generation counter: any apply / remove / re-check bumps it, so a re-check
  // that resolves after the customer has already removed or swapped the code
  // is ignored instead of resurrecting it.
  const gen = useRef(0);

  const apply = async (c: string) => {
    gen.current++;
    setBusy(true); setErr('');
    try {
      onApply(await discountsApi.check({ code: c, subtotal, phone }));
      setCode('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => { gen.current++; onRemove(); };

  // Re-check an applied code whenever the cart total or phone changes.
  useEffect(() => {
    if (!applied) return;
    const g = ++gen.current;
    discountsApi.check({ code: applied.code, subtotal, phone })
      .then((r) => { if (g === gen.current) onApply(r); })
      .catch((e) => { if (g === gen.current) { remove(); toast.info(`${applied.code} removed: ${(e as Error).message}`); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, phone]);

  const codes = offers.data?.codes ?? [];
  if (codes.length === 0 && !applied) return null;

  return (
    <section className="card-soft p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Offers</h2>
      {applied ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-900 bg-brand-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-900"><Tag className="h-4 w-4" /> {applied.code} · −{rupees(applied.amount)}</span>
          <button type="button" onClick={remove} aria-label="Remove code" className="rounded-full p-1 text-brand-500 hover:bg-cream-100"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {codes.map((o) => (
              <li key={o.code}>
                <button type="button" disabled={busy} onClick={() => apply(o.code)}
                  className="flex w-full items-center justify-between rounded-xl border border-dashed border-brand-300 px-4 py-2.5 text-left hover:border-brand-900">
                  <span className="font-mono text-sm font-bold text-brand-900">{o.code}</span>
                  <span className="text-xs text-brand-600">{offerText(o)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Have a code?" aria-label="Discount code" className="font-mono" />
            <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => apply(code.trim())}>Apply</Button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </>
      )}
    </section>
  );
}

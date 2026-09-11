import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, ShieldX, Check } from 'lucide-react';
import { api } from '../../shared/api/client';
import { groupRateLines, type RateOrderItem } from '../../shared/lib/rateLines';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import { StarInput } from '../components/StarInput';

type RateOrder = {
  order_id: number;
  ordered_on: string;
  first_name: string;
  already_reviewed: boolean;
  lines: RateOrderItem[];
};

/**
 * Rating one order, opened from a link with no login.
 *
 * The overall star is the only required answer and submitting is enabled the
 * moment it is given. Dishes and the comment appear only AFTER that first tap:
 * showing a six-dish checklist to someone who has not yet decided to engage is
 * how a rating prompt gets closed.
 */
export function Rate() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<RateOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /* Set only when the server hands back a claim link — i.e. this customer has
     never set a PIN. Existing accounts get a plain thank-you. */
  const [claimToken, setClaimToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`reviews/${token}`)
      .then((data: RateOrder) => {
        if (cancelled) return;
        setOrder(data);
        if (data.already_reviewed) setDone(true);
      })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  const lines = useMemo(() => groupRateLines(order?.lines ?? []), [order]);

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      /* Expand each group's star back across every order_items row it covers,
         so the stored rows match the order one-for-one. */
      const items = lines.flatMap((line) => {
        const s = dishStars[line.key];
        return s ? line.orderItemIds.map((id) => ({ order_item_id: id, stars: s })) : [];
      });
      const res: { claim_token?: string | null } = await api.post(`reviews/${token}`, {
        stars,
        comment: comment.trim() || undefined,
        items,
      });
      setClaimToken(res.claim_token ?? null);
      setDone(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="container-page py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-200 text-brand-600">
          <ShieldX className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-brand-900">This link isn't valid</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-brand-600">{loadError}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container-page py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-brand-900">Thank you!</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-brand-600">
          Your feedback goes straight to our kitchen.
        </p>
        {claimToken && (
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-cream-200 bg-white p-5 text-left shadow-card">
            <p className="text-sm font-semibold text-brand-900">Want to track and reorder next time?</p>
            <p className="mt-1 text-sm text-brand-600">Set a 4-digit PIN and this phone will remember you.</p>
            <Link to={`/claim/${claimToken}`} className="mt-4 block">
              <Button fullWidth>Set up my PIN</Button>
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-page flex flex-col items-center py-20 text-brand-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="mt-3 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-xl font-bold text-brand-900">
          {order.first_name ? `${order.first_name}, how was it?` : 'How was your meal?'}
        </h1>
        <p className="mt-1 text-sm text-brand-600">Order #{order.order_id}</p>

        <div className="mt-6 flex justify-center">
          <StarInput value={stars} onChange={setStars} label="Overall rating" />
        </div>

        {stars > 0 && (
          <div className="mt-8 space-y-6 animate-slide-up">
            {lines.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-brand-800">
                  Rate the dishes <span className="font-normal text-brand-500">(optional)</span>
                </h2>
                <ul className="mt-3 space-y-3">
                  {lines.map((line) => (
                    <li key={line.key} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-brand-800">
                        {line.label}
                        {line.qty > 1 && <span className="text-brand-500"> ×{line.qty}</span>}
                      </span>
                      <StarInput
                        size="sm"
                        label={`Rating for ${line.label}`}
                        value={dishStars[line.key] ?? 0}
                        onChange={(s) => setDishStars((prev) => ({ ...prev, [line.key]: s }))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label htmlFor="rate-comment" className="text-sm font-medium text-brand-800">
                Anything else? <span className="font-normal text-brand-500">(optional)</span>
              </label>
              <textarea
                id="rate-comment"
                value={comment}
                maxLength={1000}
                rows={4}
                onChange={(e) => setComment(e.target.value)}
                className="mt-2 w-full rounded-xl border border-cream-200 p-3 text-sm text-brand-900"
                placeholder="What went well, what didn't"
              />
            </div>

            {saveError && <FormError message={saveError} />}

            <Button type="button" onClick={submit} disabled={saving} variant="primary" size="lg" fullWidth>
              {saving ? 'Sending…' : 'Send feedback'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

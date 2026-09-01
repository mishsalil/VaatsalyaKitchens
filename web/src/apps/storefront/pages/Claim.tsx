import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ShieldX, Check } from 'lucide-react';
import { authApi } from '../../shared/api/endpoints';
import { useAuth } from '../../shared/hooks/useAuth';
import { Button } from '../../shared/components/ui/Button';
import { PushNudge } from '../../shared/push/PushNudge';
import { usePush } from '../../shared/push/usePush';

/**
 * /claim/:token — redeems the one-time link a rep WhatsApps after taking an
 * order at the counter.
 *
 * On success it stops here rather than bouncing straight to /account, because
 * this is the moment the push opt-in is worth asking for: the customer has just
 * landed on their own phone, with a live order, having deliberately opened the
 * link. Subscribing while signed in binds the subscription to their customer
 * row, so status changes actually reach them. /account is one tap away.
 *
 * The link is burned server-side on first use, so a reload lands on the "already
 * used" message rather than silently failing — hence the StrictMode guard: in
 * development the effect runs twice, and without it the second run would always
 * report the link as spent.
 */
export function Claim() {
  const { token } = useParams();
  const { refresh, loading, user } = useAuth();
  const { ensure } = usePush();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const redeemed = useRef(false);

  useEffect(() => {
    // Wait for the auth bootstrap: the customer arrives here cold, from a
    // WhatsApp link, and GET /api/me is what delivers the CSRF token. Posting
    // before it lands is rejected as "Session expired".
    if (loading || !token || redeemed.current) return;
    redeemed.current = true;
    authApi
      .claim(token)
      .then(async () => {
        await refresh();
        // Re-bind any EXISTING subscription to the now-known customer. A device
        // that enabled push as a guest has push_subscriptions.customer_id = NULL,
        // and PushNudge stays hidden when already subscribed — so without this
        // the customer would look opted-in yet still be unreachable by
        // push_send_to_customer(). ensureSubscribed() re-POSTs the same endpoint
        // and the server upserts customer_id from the session; it is a no-op
        // when notifications were never granted.
        await ensure().catch(() => {});
        setDone(true);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading]);

  if (error) {
    return (
      <div className="container-page py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-200 text-brand-600">
          <ShieldX className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-brand-900">This link cannot be used</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-brand-600">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/order"><Button>Browse the menu</Button></Link>
          <Link to="/login"><Button variant="outline">Sign in</Button></Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container-page space-y-5 py-10">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-brand-900">
            {user ? `You're signed in, ${user.name.split(' ')[0]}` : "You're signed in"}
          </h1>
          <p className="mt-1 text-sm text-brand-600">This phone will remember you from now on.</p>
        </div>

        {/* The whole point of stopping here — ask while the order is live. */}
        <PushNudge surface="claim" />

        <div className="flex justify-center">
          <Link to="/account"><Button>View my order</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page flex flex-col items-center py-20 text-brand-500">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="mt-3 text-sm">Signing you in…</p>
    </div>
  );
}

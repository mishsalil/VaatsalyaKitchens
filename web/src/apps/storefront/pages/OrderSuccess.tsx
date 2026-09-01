import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, MessageCircle, ListChecks } from 'lucide-react';
import { ordersApi } from '../../shared/api/endpoints';
import { useFetch } from '../../shared/hooks/useFetch';
import { useAuth } from '../../shared/hooks/useAuth';
import { displayPhone } from '../../shared/lib/format';
import { buildWaMeUrl } from '../../shared/lib/whatsapp';
import { lineLabel } from '../../shared/types';
import { Button } from '../../shared/components/ui/Button';
import { Skeleton } from '../../shared/components/Skeleton';
import { OrderStatusPoller } from '../components/OrderStatusPoller';
import { BillDetails, type BillItem, type BillGst } from '../components/BillDetails';
import { PinSetup } from '../components/PinSetup';
import { PushNudge } from '../../shared/push/PushNudge';
import { CancelCountdown } from '../components/CancelCountdown';

export function OrderSuccess() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useAuth();
  const orderId = Number(id);
  const { data, loading, error, refetch } = useFetch(() => ordersApi.show(orderId), [orderId]);

  if (loading) {
    return (
      <div className="container-page py-10">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="container-page py-10 text-center">
        <h1 className="text-2xl font-bold text-brand-900">Order not found</h1>
        <p className="mt-2 text-brand-600">We couldn't find that order. It may belong to a different account.</p>
        <Link to="/" className="mt-4 inline-block"><Button>Back to Home</Button></Link>
      </div>
    );
  }

  const order = data.order;
  const waUrl = settings ? buildWaMeUrl(settings.kitchen_whatsapp, order) : '#';
  const firstName = order.name.split(' ')[0];
  const billItems: BillItem[] = order.items.map((it) => ({
    name: lineLabel(it.item_name, it.variant_name, it.addons_text),
    qty: it.qty,
    unit: it.unit,
    price: it.price,
  }));
  // Counter orders can carry a discount, a delivery charge or be complimentary,
  // so the bill card is shown whenever any of those is set — not only when GST is.
  const gst: BillGst | null =
    order.gst_rate > 0 || order.discount_amount > 0 || order.delivery_charge > 0 || order.is_complimentary
      ? {
          subtotal: order.subtotal,
          cgst: order.cgst,
          sgst: order.sgst,
          roundOff:
            Math.round(
              (order.total_estimate -
                (order.subtotal - order.discount_amount) -
                order.cgst -
                order.sgst -
                order.delivery_charge) *
                100,
            ) / 100,
          rate: order.gst_rate,
          discountPct: order.discount_pct,
          discountAmount: order.discount_amount,
          deliveryCharge: order.delivery_charge,
          complimentary: order.is_complimentary,
        }
      : null;

  return (
    <div className="container-page py-6">
      {/* Confirmation header */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-brand-900">Thank you, {firstName}!</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-600">
          Your order <strong>#{order.id}</strong> is saved with us. We will call you on{' '}
          <strong>{displayPhone(order.phone)}</strong> to confirm it shortly.
        </p>
      </div>

      {/* Short self-cancel window, straight after placing. */}
      <CancelCountdown
        orderId={order.id}
        secondsLeft={order.cancel_seconds_left}
        onCancelled={() => refetch()}
      />

      {/* Live status tracker */}
      <div className="mt-6">
        <OrderStatusPoller orderId={order.id} initial={order} />
      </div>

      {/* Bill */}
      <div className="mt-5">
        <BillDetails items={billItems} total={order.total_estimate} gst={gst} />
        <p className="mt-2 px-1 text-xs text-brand-500">
          Needed on: {order.needed_on} · {order.address_text ? `Delivery to: ${order.address_text}` : 'Pickup order'}
        </p>
      </div>

      <div className="mt-5">
        <PushNudge surface="success" />
      </div>

      {/* CTAs */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a href={waUrl} target="_blank" rel="noopener" className="sm:flex-1">
          <Button variant="whatsapp" size="lg" fullWidth>
            <MessageCircle className="h-5 w-5" /> Send it on WhatsApp
          </Button>
        </a>
        <Link to="/account" className="sm:flex-1">
          <Button variant="outline" size="lg" fullWidth>
            <ListChecks className="h-5 w-5" /> See my orders
          </Button>
        </Link>
      </div>

      <div className="mt-6">
        <PinSetup />
      </div>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-6 block w-full text-center text-sm text-brand-500 hover:underline"
      >
        Back to Home
      </button>
    </div>
  );
}
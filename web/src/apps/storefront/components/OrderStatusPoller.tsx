import { useEffect, useState } from 'react';
import { ordersApi } from '../../shared/api/endpoints';
import { isOrderActive } from '../../shared/lib/format';
import type { Order } from '../../shared/types';
import { StatusTimeline } from './StatusTimeline';

/**
 * Polls /api/orders/show/:id every 15s while the order is still active and
 * renders a live Swiggy-style status tracker, so the customer sees progress
 * on the success page without a full-page reload.
 */
export function OrderStatusPoller({ orderId, initial }: { orderId: number; initial: Order }) {
  const [order, setOrder] = useState<Order>(initial);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 15000));
        if (stop) break;
        try {
          const { order: next } = await ordersApi.show(orderId);
          if (stop) break;
          setOrder(next);
          if (!isOrderActive(next.status)) break;
        } catch {
          break;
        }
      }
    };
    if (isOrderActive(initial.status)) poll();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const active = isOrderActive(order.status);

  return (
    <div className="card-soft p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Order status</h3>
        {active && (
          <span className="flex items-center gap-1.5 text-xs text-brand-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-500" />
            Live
          </span>
        )}
      </div>
      <StatusTimeline status={order.status} />
    </div>
  );
}
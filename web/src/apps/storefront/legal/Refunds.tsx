import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/useAuth';
import { LegalPage, Clause, Fact } from './LegalPage';
import { business } from './businessDetails';

/**
 * The five-minute self-cancel window stated here is not a guess: it is
 * CUSTOMER_CANCEL_SECONDS in api/routes/orders.php, enforced server-side
 * against orders.created_at. If that constant changes, change this page.
 */
export function Refunds() {
  const { settings } = useAuth();
  const name = settings?.kitchen_name ?? 'Vaatsalya Kitchens';
  const phone = settings?.kitchen_phone_display || business.contactPhone;

  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      intro={
        <p>
          We cook fresh to order, so there is a short window in which an order can be cancelled. This page explains
          exactly when you can cancel, when you can get a refund, and how long it takes.
        </p>
      }
    >
      <Clause heading="Cancelling within 5 minutes — no reason needed">
        <p>
          For <strong>five minutes</strong> after you place an order, you can cancel it yourself from the order screen
          with the &ldquo;Changed your mind?&rdquo; button. No reason is needed and there is no charge. If you paid
          online, you receive a full refund.
        </p>
        <p>
          The five minutes are counted by our server from the moment the order was placed, and the option disappears
          once the kitchen has moved the order past confirmation.
        </p>
      </Clause>

      <Clause heading="Cancelling after 5 minutes">
        <p>
          After that, please call us on{' '}
          {phone ? <a className="link-quiet font-medium" href={`tel:+${settings?.kitchen_whatsapp}`}>{phone}</a> : 'our kitchen number'}.
          Whether we can cancel depends on how far the order has got:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Not yet started</strong> — we will cancel it and refund you in full.</li>
          <li><strong>Being cooked</strong> — we may charge for ingredients already used, and refund the rest.</li>
          <li><strong>Cooked, or out for delivery</strong> — we cannot cancel it, because the food cannot be sold to anyone else.</li>
        </ul>
        <p>
          For party and bulk orders, please cancel at least{' '}
          <Fact value={business.cancellationCutOff} label="cancellation cut-off" /> before the delivery time. We buy
          ingredients in advance for these, so a later cancellation may be charged.
        </p>
      </Clause>

      <Clause heading="If something is wrong with your order">
        <p>
          Tell us on the day, and where you can, before the food is eaten — please keep the item so we can see it.
          We will replace it or refund it if:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>an item is missing from your delivery;</li>
          <li>you were sent the wrong item;</li>
          <li>the food arrived spoiled, or in unsafe condition;</li>
          <li>the food was not of the quality you are entitled to expect from us.</li>
        </ul>
        <p>
          We cannot refund an order simply because a dish was not to your taste, or because the quantity ordered was
          more than you needed. Home-style cooking varies a little from batch to batch, and photographs on the menu are
          indicative.
        </p>
      </Clause>

      <Clause heading="Orders we cancel">
        <p>
          If we cannot fulfil an order — a dish runs out, the address turns out to be outside our delivery area, or
          something outside our control stops us — we will tell you as soon as we can and refund the full amount,
          including any delivery charge.
        </p>
      </Clause>

      <Clause heading="Failed deliveries">
        <p>
          If we arrive and nobody is there, or the phone number given does not answer, our rider will wait a short
          while and try to call. If we still cannot hand the order over, it is treated as delivered and cannot be
          refunded — prepared food cannot be kept or resold. Please make sure the address and phone number are right
          before you confirm an order.
        </p>
      </Clause>

      <Clause heading="How a refund is paid">
        <p>
          A refund goes back by the same method you paid with. Online payments are returned to the card, UPI handle or
          account used; cash payments are refunded in cash or by UPI, as you prefer.
        </p>
        <p>
          Refunds are started as soon as the cancellation is agreed. Money usually reaches you within{' '}
          <Fact value={business.refundTimeline} label="refund timeline" />, depending on your bank or payment
          provider — that last step is in their hands, not ours.
        </p>
      </Clause>

      <Clause heading="How to raise a refund request">
        <p>
          Call or message {name} on{' '}
          {phone ? <a className="link-quiet font-medium" href={`tel:+${settings?.kitchen_whatsapp}`}>{phone}</a> : 'our kitchen number'}
          {settings?.kitchen_email ? <>, or email <a className="link-quiet font-medium" href={`mailto:${settings.kitchen_email}`}>{settings.kitchen_email}</a></> : null}
          , with your order number and what went wrong. A photograph helps if the problem is with the food. We aim to
          answer the same day, and to resolve refund requests within 48 hours of agreeing them.
        </p>
        <p>
          If you are not satisfied with how we have handled it, you can escalate to our Grievance Officer, whose
          details are on the <Link className="link-quiet font-medium" to="/privacy">Privacy Policy</Link> page. Nothing in
          this policy affects your rights under the Consumer Protection Act, 2019.
        </p>
      </Clause>
    </LegalPage>
  );
}

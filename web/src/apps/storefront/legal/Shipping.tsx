import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/useAuth';
import { LegalPage, Clause, Fact } from './LegalPage';
import { business } from './businessDetails';

export function Shipping() {
  const { settings } = useAuth();
  const name = settings?.kitchen_name ?? 'Vaatsalya Kitchens';
  const phone = settings?.kitchen_phone_display || business.contactPhone;

  return (
    <LegalPage
      title="Shipping & Delivery Policy"
      intro={<p>Where {name} delivers, when, and what it costs.</p>}
    >
      <Clause heading="What we deliver">
        <p>
          We deliver freshly cooked food. There is no physical shipment, no courier and no tracking number — an order
          is cooked in our kitchen and brought to your address by our own delivery staff on the day.
        </p>
      </Clause>

      <Clause heading="Where we deliver">
        <p>
          We deliver to <Fact value={business.deliveryAreas} label="delivery areas" />. If your address falls outside
          that area we will tell you before accepting the order, and nothing will be charged.
        </p>
      </Clause>

      <Clause heading="When we deliver">
        <p>
          We deliver during our kitchen hours, which are shown on the home page and can change on festivals and public
          holidays. Orders are delivered at the time agreed when the order is confirmed.
        </p>
        <p>
          Party and bulk orders need at least <Fact value={business.noticePeriod} label="notice period" /> notice so we
          can buy ingredients and plan the cooking.
        </p>
      </Clause>

      <Clause heading="Delivery charges">
        <p>
          Delivery charge: <Fact value={business.deliveryCharge} label="delivery charge" />. Minimum order value:{' '}
          <Fact value={business.minimumOrder} label="minimum order value" />. Any charge that applies is shown on your
          bill before you confirm the order — there are no charges added afterwards.
        </p>
      </Clause>

      <Clause heading="Keeping you posted">
        <p>
          You can follow your order on the order screen, which updates as the kitchen accepts it, prepares it and sends
          it out. If you allow notifications, we will tell you at each of those steps. We may also call or message you
          about a delivery.
        </p>
      </Clause>

      <Clause heading="Getting your order to you">
        <p>
          Please give a complete address with a landmark, and a phone number that will be answered. Our rider will call
          on arrival. For a gated society, an office, or a building with restricted entry, please arrange access or
          meet the rider at the gate.
        </p>
        <p>
          If nobody can take the delivery, our rider will wait a short while and try to call. If the order still cannot
          be handed over it is treated as delivered and cannot be refunded, because prepared food cannot be resold. See
          our <Link className="link-quiet font-medium" to="/refunds">Cancellation &amp; Refund Policy</Link>.
        </p>
      </Clause>

      <Clause heading="Delays">
        <p>
          We aim to deliver at the agreed time, but heavy rain, traffic, a road closure or an unusually busy day can
          delay us. We will tell you if your order is running late. Delivery times are our honest estimate rather than
          a guarantee, except where we have agreed a fixed time for a party or bulk order.
        </p>
      </Clause>

      <Clause heading="Food safety">
        <p>
          Food is packed to travel and is best eaten soon after it arrives. Once an order has been handed over, please
          refrigerate anything you are not eating straight away. We cannot take responsibility for food that has been
          left out after delivery.
        </p>
      </Clause>

      <Clause heading="Questions about a delivery">
        <p>
          Call {name} on{' '}
          {phone ? <a className="link-quiet font-medium" href={`tel:+${settings?.kitchen_whatsapp}`}>{phone}</a> : 'our kitchen number'}
          , or see the <Link className="link-quiet font-medium" to="/contact">Contact Us</Link> page.
        </p>
      </Clause>
    </LegalPage>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/useAuth';
import { LegalPage, Clause, Fact } from './LegalPage';
import { business } from './businessDetails';

export function Terms() {
  const { settings } = useAuth();
  const name = settings?.kitchen_name ?? 'Vaatsalya Kitchens';
  const gst = settings?.gst_rate ?? '';

  return (
    <LegalPage
      title="Terms & Conditions"
      intro={<p>The terms on which {name} accepts and fulfils your order. Please read them before ordering.</p>}
    >
      <Clause heading="1. About these terms">
        <p>
          These terms form an agreement between you and{' '}
          <Fact value={business.legalName} label="registered business name" />, a{' '}
          <Fact value={business.entityType} label="entity type" /> trading as {name}. By placing an order on this
          website or in our app, you accept these terms. If you do not accept them, please do not place an order.
        </p>
      </Clause>

      <Clause heading="2. Who may order">
        <p>
          You must be 18 or older and able to enter into a contract. You must give a working mobile number and a
          correct delivery address, and keep your account details accurate. You are responsible for what happens under
          your account, so please keep your PIN to yourself.
        </p>
      </Clause>

      <Clause heading="3. Our food">
        <p>
          We cook home-style vegetarian food to order. Photographs on the menu show the dish as it is usually served
          and are indicative — the exact appearance of a home-cooked dish varies between batches.
        </p>
        <p>
          <strong>Allergens.</strong> Our food is prepared in a single kitchen where nuts, dairy, wheat and other
          common allergens are in use, so we cannot guarantee that any dish is free of traces of them. If you have a
          food allergy or intolerance, please tell us before ordering and take your own advice on whether to order.
        </p>
        <p>
          We operate under FSSAI licence number <Fact value={business.fssai} label="FSSAI licence number" />.
        </p>
      </Clause>

      <Clause heading="4. Placing an order">
        <p>
          Adding items to your cart is not an order. An order is placed when you confirm it, and a contract is formed
          only when we <strong>accept</strong> it — we will confirm acceptance by notification, call or message. We may
          decline an order, for example if a dish is unavailable, if the delivery address is outside the area we serve,
          if we cannot cook the quantity in the time asked for, or if we reasonably suspect misuse.
        </p>
        <p>
          Party and bulk orders need at least <Fact value={business.noticePeriod} label="notice period" /> notice.
        </p>
      </Clause>

      <Clause heading="5. Prices, taxes and payment">
        <p>
          Prices are shown in Indian Rupees on the menu. {gst ? `GST is charged at ${gst}% and is shown separately on your bill.` : 'Applicable taxes are shown separately on your bill.'}{' '}
          A delivery charge may apply: <Fact value={business.deliveryCharge} label="delivery charge" />. Minimum order
          value: <Fact value={business.minimumOrder} label="minimum order value" />.
        </p>
        <p>
          We may change menu prices at any time, but the price shown when you place your order is the price you pay for
          that order. If a price is displayed that is obviously wrong, we may cancel the order and refund you in full
          rather than fulfil it at that price.
        </p>
        <p>
          Payment is made by the methods offered at checkout. Where online payment is used, it is processed by a
          third-party payment gateway; we do not receive or store your card, UPI or bank details.
        </p>
      </Clause>

      <Clause heading="6. Delivery">
        <p>
          Delivery is covered in our <Link className="link-quiet font-medium" to="/shipping">Shipping &amp; Delivery Policy</Link>,
          which forms part of these terms.
        </p>
      </Clause>

      <Clause heading="7. Cancellations and refunds">
        <p>
          Cancellations and refunds are covered in our{' '}
          <Link className="link-quiet font-medium" to="/refunds">Cancellation &amp; Refund Policy</Link>, which forms part
          of these terms. Because food is prepared fresh to order and is perishable, cancellation rights are limited
          once cooking has begun.
        </p>
      </Clause>

      <Clause heading="8. Using this website and app">
        <p>
          You may use our website and app only to browse the menu and place genuine orders. You must not attempt to
          break into any account or system, disrupt the service, scrape or copy the site, place fraudulent or repeated
          hoax orders, or use the service in any unlawful way. We may suspend or close an account that does.
        </p>
      </Clause>

      <Clause heading="9. Our content">
        <p>
          The name {name}, our logo, our dish photographs and the text on this site belong to us and may not be copied
          or reused without our written permission.
        </p>
      </Clause>

      <Clause heading="10. Our responsibility to you">
        <p>
          We will prepare and deliver your order with reasonable care and skill. If we get an order wrong, our
          responsibility is to put it right — by replacing the item or refunding it, as set out in the Cancellation
          &amp; Refund Policy. To the extent the law allows, we are not liable for indirect or consequential losses,
          and our total liability for any order is limited to the amount you paid for that order. Nothing in these
          terms limits any liability that cannot lawfully be limited, including liability for death or personal injury
          caused by our negligence, or your rights under the Consumer Protection Act, 2019.
        </p>
      </Clause>

      <Clause heading="11. Events outside our control">
        <p>
          We are not responsible for a delay or failure to deliver caused by something outside our reasonable control,
          such as extreme weather, a power or water failure, a strike, a civil disturbance, or a government
          restriction. If such an event prevents us from delivering your order, we will refund it in full.
        </p>
      </Clause>

      <Clause heading="12. Changes to these terms">
        <p>
          We may update these terms. The version published on this page when you place an order is the version that
          applies to that order.
        </p>
      </Clause>

      <Clause heading="13. Governing law">
        <p>
          These terms are governed by the laws of India, and the courts at{' '}
          <Fact value={business.jurisdiction} label="jurisdiction" /> shall have exclusive jurisdiction over any
          dispute. Before going to court, please contact us — most problems are settled quickly by talking to us.
        </p>
      </Clause>

      <Clause heading="14. Contact">
        <p>
          Questions about these terms? Our contact details are on the{' '}
          <Link className="link-quiet font-medium" to="/contact">Contact Us</Link> page.
        </p>
      </Clause>
    </LegalPage>
  );
}

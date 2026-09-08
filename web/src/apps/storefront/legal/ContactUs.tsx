import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, MessageCircle, Clock } from 'lucide-react';
import { useAuth } from '../../shared/hooks/useAuth';
import { LegalPage, Clause, Fact } from './LegalPage';
import { business } from './businessDetails';


/**
 * A payment gateway checks that a real, reachable address and phone number are
 * published on the site, so this page states them plainly rather than hiding
 * them behind a contact form.
 */
export function ContactUs() {
  const { settings } = useAuth();
  const name = settings?.kitchen_name ?? 'Vaatsalya Kitchens';
  const email = business.contactEmail;
  const phone = settings?.kitchen_phone_display || business.contactPhone;
  const wa = settings?.kitchen_whatsapp || '919623836382';

  return (
    <LegalPage
      title="Contact Us"
      dated={false}
      intro={<p>Talk to us about an order, a party booking, or anything that has gone wrong. A phone call is quickest.</p>}
    >
      <Clause heading="How to reach us">
        <ul className="space-y-3">
          {phone && (
            <li className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <span>
                <strong>Phone</strong>
                <br />
                <a className="link-quiet font-medium" href={`tel:+${wa}`}>{phone}</a>
              </span>
            </li>
          )}
          {wa && (
            <li className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <span>
                <strong>WhatsApp</strong>
                <br />
                <a className="link-quiet font-medium" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  Message us on WhatsApp
                </a>
              </span>
            </li>
          )}
          {email && (
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <span>
                <strong>Email</strong>
                <br />
                <a className="link-quiet font-medium" href={`mailto:${email}`}>{email}</a>
              </span>
            </li>
          )}
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <span>
              <strong>Kitchen address</strong>
              <br />
              <Fact value={settings?.kitchen_address || business.registeredAddress} label="kitchen address" />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <span>
              <strong>Hours</strong>
              <br />
              Our kitchen hours are shown on the <Link className="link-quiet font-medium" to="/">home page</Link>.
            </span>
          </li>
        </ul>
      </Clause>

      <Clause heading="Business details">
        <p>
          <strong>Registered name:</strong> <Fact value={business.legalName} label="registered business name" />
          <br />
          <strong>Entity type:</strong> <Fact value={business.entityType} label="entity type" />
          <br />
          <strong>Registered address:</strong> <Fact value={business.registeredAddress} label="registered address" />
          <br />
          <strong>GSTIN:</strong> <Fact value={business.gstin} label="GSTIN" />
          <br />
          <strong>FSSAI licence:</strong> <Fact value={business.fssai} label="FSSAI licence number" />
        </p>
      </Clause>

      <Clause heading="Complaints">
        <p>
          If something has gone wrong with an order, please call us first — most problems are sorted out on the same
          day. See our <Link className="link-quiet font-medium" to="/refunds">Cancellation &amp; Refund Policy</Link> for
          what we can put right.
        </p>
        <p>
          If you are not satisfied with our answer, you can escalate to our Grievance Officer:{' '}
          <Fact value={business.grievanceOfficerName} label="officer name" />,{' '}
          <Fact value={business.grievanceOfficerEmail} label="officer email" />,{' '}
          <Fact value={business.grievanceOfficerPhone} label="officer phone" />.
        </p>
      </Clause>

      <Clause heading="Ordering">
        <p>
          To place an order, browse the <Link className="link-quiet font-medium" to="/order">menu</Link>. For a party,
          kitty or bulk order, call us — we will help you work out quantities. {name} needs at least{' '}
          <Fact value={business.noticePeriod} label="notice period" /> notice for those.
        </p>
      </Clause>
    </LegalPage>
  );
}

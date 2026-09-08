/**
 * The business facts the policy pages have to state.
 *
 * WHY THIS FILE EXISTS. A privacy policy, a refund policy and a shipping
 * policy are legal statements about a real company, and a payment gateway
 * checks them against the company it is onboarding. Everything below is a
 * fact about Vaatsalya Kitchens that only the owner can supply — inventing a
 * GSTIN, an FSSAI licence number or a refund window would produce pages that
 * look complete and are wrong, which is worse than pages that are visibly
 * unfinished.
 *
 * So anything not yet known is PENDING, and a PENDING value renders on the
 * page as a marker you cannot miss rather than as an empty space.
 *
 * Phone and email also live in admin Settings, which is what the header and
 * footer read. Keep the two in step: the constants here are what the policy
 * pages state, and a policy that contradicts the footer is a problem.
 */

/** Marker for a fact the owner still has to supply. */
export const PENDING = '__PENDING__';

export function isPending(value: string): boolean {
  return value === PENDING || value.trim() === '';
}

export const business = {
  /* ---- Identity ------------------------------------------------------- */
  /** Registered legal name, if it differs from the trading name. */
  legalName: 'Vaatsalya Kitchens',
  /**
   * e.g. "Sole Proprietorship", "Private Limited Company", "Partnership".
   * NOT YET CONFIRMED. The PAN inside the GSTIN (AVYPM7231Q) has "P" in the
   * fourth position, which denotes an individual — so this is very likely a
   * sole proprietorship. Confirm before relying on it; it is a legal statement.
   */
  entityType: PENDING,
  /** Full registered address, including PIN code. */
  registeredAddress: '#001, Mishra Niwas, Sitapur SPN Highway, Badaura, Sitapur - 261001',
  /** Place whose courts have jurisdiction — a city, not the full address. */
  jurisdiction: 'Sitapur, Uttar Pradesh',

  /* ---- Statutory registrations ---------------------------------------- */
  /** GSTIN. The menu already charges GST, so a gateway will expect this. */
  gstin: '09AVYPM7231Q1ZE',
  /**
   * FSSAI licence / registration number. Displaying this is mandatory for a
   * food business in India, not optional.
   */
  fssai: '227263400000186',

  /* ---- Published contact ---------------------------------------------- */
  /* Stated on the policy pages themselves, so they read correctly even if
     admin Settings has not been filled in yet. */
  contactPhone: '+91-9623836382',
  contactEmail: 'vaatsalyakitchens@gmail.com',

  /* ---- Grievance officer ---------------------------------------------- */
  /* Required by the IT (Intermediary Guidelines) Rules 2021 and by the
     Consumer Protection (E-Commerce) Rules 2020. The channels are the business
     ones; the rules want a NAMED person, which is still to be supplied. */
  grievanceOfficerName: PENDING,
  grievanceOfficerEmail: 'vaatsalyakitchens@gmail.com',
  grievanceOfficerPhone: '+91-9623836382',

  /* ---- Ordering and delivery terms ------------------------------------ */
  /** Where you deliver, in plain words. e.g. "Sitapur city, within 10 km of ...". */
  deliveryAreas: PENDING,
  /** How much notice a bulk or party order needs. e.g. "24 hours". */
  noticePeriod: PENDING,
  /** How late an order may be cancelled without a charge. e.g. "12 hours". */
  cancellationCutOff: PENDING,
  /** Delivery charge, or how it is calculated. */
  deliveryCharge: PENDING,
  /** Minimum order value, if any. Use "None" when there is none. */
  minimumOrder: PENDING,
  /** How long a refund takes to reach the customer. e.g. "5-7 working days". */
  refundTimeline: PENDING,

  /* ---- Housekeeping ---------------------------------------------------- */
  /** Date these policies took effect. Set this to the day you publish them. */
  effectiveDate: PENDING,
} as const;

export type BusinessDetails = typeof business;

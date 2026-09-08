import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isPending, business } from './businessDetails';

/**
 * Shared shell for the policy pages: one title, one effective date, one column
 * of readable prose. These pages are read by customers, by payment-gateway
 * reviewers and by search engines, so they are plain HTML text — no tabs, no
 * accordions, nothing that hides a clause behind an interaction.
 */
export function LegalPage({ title, intro, children, dated = true }: { title: string; intro?: ReactNode; children: ReactNode; /** Policies carry an effective date; a contact page does not. */ dated?: boolean }) {
  return (
    <div className="container-page py-8 sm:py-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> Back to Vaatsalya Kitchens
      </Link>

      <h1 className="mt-5 font-serif text-3xl font-bold text-brand-900 sm:text-4xl">{title}</h1>
      {dated && (
        <p className="mt-2 text-sm text-brand-400">
          Effective from <Fact value={business.effectiveDate} label="effective date" />
        </p>
      )}
      {intro && <div className="mt-4 text-brand-700">{intro}</div>}

      <div className="legal-prose mt-8 space-y-6 pb-8 text-brand-800">{children}</div>
    </div>
  );
}

/** A titled clause. */
export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-900">{heading}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-brand-700">{children}</div>
    </section>
  );
}

/**
 * One business fact. A fact the owner has not supplied yet renders as a
 * marker rather than a blank, so an unfinished policy is obvious on the page
 * instead of reading as a complete sentence that happens to be missing a
 * licence number.
 */
export function Fact({ value, label }: { value: string; label: string }) {
  if (isPending(value)) {
    return (
      <span
        className="mx-0.5 inline-block rounded border border-dashed border-red-400 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700"
        title={`Add the ${label} in web/src/apps/storefront/legal/businessDetails.ts`}
      >
        [{label} to be added]
      </span>
    );
  }
  return <>{value}</>;
}

"use client";

import Link from "next/link";

import type { DistrictPrice, PinListing } from "@/lib/duckdb/queries";
import { formatNumber, formatPrice } from "@/lib/format";
import { interpolate, type Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * Asking price against the model's estimate, and what the estimate rests on.
 *
 * The deviation is stated as a fact and left uncoloured. It compares one asking
 * price to a model fitted on other asking prices, which is not enough to call a
 * listing a bargain or a rip-off: the model does not know the finish, the view,
 * the neighbours, or why the seller is asking what they ask.
 */

/** Below this the asking price is treated as agreeing with the estimate. */
const IN_LINE_THRESHOLD = 0.05;

type ValuationCardProps = {
  dictionary: Dictionary;
  locale: Locale;
  listing: PinListing;
  /** Comparable listings of the same type in the same district, if any. */
  comparable: DistrictPrice | null;
  /** Measured out-of-fold median error, for the accuracy note. */
  medianErrorPct: number;
};

function formatPercent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

export function ValuationCard({
  dictionary,
  locale,
  listing,
  comparable,
  medianErrorPct,
}: ValuationCardProps) {
  const { estimate, estimate_low, estimate_high, price_delta_pct } = listing;

  if (estimate === null || estimate_low === null || estimate_high === null) {
    // Absent rather than blank: a missing estimate has a reason, and saying
    // which one is more useful than an empty space.
    const reason =
      listing.estate_benefit === "rental"
        ? dictionary.valuation.noneRental
        : dictionary.valuation.noneOutOfRange;

    return (
      <section className="meimar-valuation is-empty">
        <h3>{dictionary.valuation.title}</h3>
        <p className="meimar-valuation-none">{dictionary.valuation.none}</p>
        <p className="meimar-disclaimer">{reason}</p>
      </section>
    );
  }

  const delta = price_delta_pct ?? 0;
  const deviation =
    Math.abs(delta) < IN_LINE_THRESHOLD
      ? dictionary.valuation.inline
      : interpolate(
          delta > 0 ? dictionary.valuation.above : dictionary.valuation.below,
          { pct: formatPercent(delta) },
        );

  const typeLabel =
    (dictionary.estateTypes as Record<string, string | undefined>)[listing.estate_type] ??
    listing.estate_type;

  return (
    <section className="meimar-valuation">
      <h3>{dictionary.valuation.title}</h3>

      {/* A description list, because that is what these are. It was a plain
          `<div>` holding `<dt>`/`<dd>`, which is invalid and carries none of
          the term/definition semantics a screen reader reads them out with. */}
      <dl className="meimar-valuation-figures">
        <div>
          <dt>{dictionary.valuation.asking}</dt>
          <dd className="tabular">{formatPrice(listing.price, dictionary)}</dd>
        </div>
        <div>
          <dt>{dictionary.valuation.estimate}</dt>
          <dd className="tabular meimar-valuation-estimate">
            {formatPrice(estimate, dictionary)}
          </dd>
        </div>
      </dl>

      <p className="meimar-valuation-deviation">{deviation}</p>

      {/* The interval is never optional. A median error near 10% means one
          listing in two is off by more than a tenth, so a bare point estimate
          would imply a precision the model does not have. */}
      <p className="meimar-valuation-range tabular">
        {dictionary.valuation.range}: {formatPrice(estimate_low, dictionary)} –{" "}
        {formatPrice(estimate_high, dictionary)}
      </p>

      {/* What the number rests on. Comparables are the same property type in
          the same district: a villa is not comparable to the plot next door,
          and the district-wide figure mixes both. */}
      {comparable !== null && (
        <p className="meimar-valuation-basis">
          {interpolate(dictionary.valuation.basedOn, {
            count: formatNumber(comparable.listing_count),
            type: typeLabel,
            district: listing.district,
          })}
          <br />
          <span className="tabular">
            {interpolate(dictionary.valuation.typicalRange, {
              low: formatNumber(comparable.p25_price_per_m2),
              high: formatNumber(comparable.p75_price_per_m2),
              unit: dictionary.units.sarPerSqm,
            })}
          </span>
        </p>
      )}

      <p className="meimar-disclaimer">
        {dictionary.valuation.basis}{" "}
        {interpolate(dictionary.valuation.accuracy, {
          pct: `${medianErrorPct.toFixed(1)}%`,
        })}{" "}
        <Link href={`/${locale}/methodology`}>{dictionary.nav.methodology}</Link>
      </p>
    </section>
  );
}

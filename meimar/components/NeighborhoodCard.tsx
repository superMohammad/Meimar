"use client";

import { formatNumber, formatPrice } from "@/lib/format";
import type { DistrictStats } from "@/lib/duckdb/queries";
import type { Dictionary } from "@/lib/i18n";

/**
 * Aqar-style neighborhood card for one (city, district) pair.
 *
 * When the district holds fewer listings than the aggregation threshold, this
 * says so instead of printing a median. The 10th-percentile district in this
 * dataset has three listings, and a median of three asking prices presented as
 * a neighborhood fact is misinformation, not a rough estimate.
 */

type NeighborhoodCardProps = {
  dictionary: Dictionary;
  stats: DistrictStats;
};

export function NeighborhoodCard({ dictionary, stats }: NeighborhoodCardProps) {
  return (
    <section className="meimar-neighborhood">
      <h3>{dictionary.district.title}</h3>
      <p className="meimar-neighborhood-name">
        {stats.district} · {stats.city}
      </p>

      {stats.sufficient ? (
        <dl className="meimar-stats">
          <div>
            <dt>{dictionary.district.listings}</dt>
            <dd className="tabular">{formatNumber(stats.listing_count)}</dd>
          </div>
          {stats.median_price !== null && (
            <div>
              <dt>{dictionary.district.medianPrice}</dt>
              <dd className="tabular">{formatPrice(stats.median_price, dictionary)}</dd>
            </div>
          )}
          {stats.median_price_per_m2 !== null && (
            <div>
              <dt>{dictionary.district.medianPricePerM2}</dt>
              <dd className="tabular">
                {formatNumber(stats.median_price_per_m2)} {dictionary.units.sarPerSqm}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <div className="meimar-insufficient">
          <strong>{dictionary.district.insufficient}</strong>
          <p>{dictionary.district.insufficientHint}</p>
          <p className="meimar-insufficient-count tabular">
            {dictionary.district.listings}: {formatNumber(stats.listing_count)}
          </p>
        </div>
      )}
    </section>
  );
}

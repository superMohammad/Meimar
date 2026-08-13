"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  queryComparable,
  queryDistrict,
  queryListingById,
  queryListingDetail,
  type DistrictPrice,
  type DistrictStats,
  type ListingDetail,
  type PinListing,
} from "@/lib/duckdb/queries";
import { formatArea, formatPrice } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { marketOf, type ModelMetricsByMarket } from "@/lib/model-metrics";

import { NeighborhoodCard } from "./NeighborhoodCard";
import { ServicesList, type RadiusMetres } from "./ServicesList";
import { ValuationCard } from "./ValuationCard";

/**
 * The standalone listing page's body.
 *
 * Reuses the cards the map panel already renders rather than duplicating them,
 * so a change to how an estimate is presented lands in both places at once.
 */

type ListingViewProps = {
  locale: Locale;
  dictionary: Dictionary;
  listingId: number;
  metrics: ModelMetricsByMarket;
};

type Loaded = {
  listing: PinListing;
  detail: ListingDetail | null;
  district: DistrictStats | null;
  comparable: DistrictPrice | null;
};

export function ListingView({ locale, dictionary, listingId, metrics }: ListingViewProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState<RadiusMetres>(1000);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const listing = await queryListingById(listingId);
        if (cancelled) return;
        if (listing === null) {
          setMissing(true);
          return;
        }

        const [detail, district, comparable] = await Promise.all([
          queryListingDetail(listing.id),
          queryDistrict(listing.city, listing.district),
          queryComparable(
            listing.city,
            listing.district,
            listing.estate_type,
            listing.estate_benefit,
          ),
        ]);
        if (cancelled) return;
        setLoaded({ listing, detail, district, comparable });
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (error !== null) return <p className="meimar-error-inline">{error}</p>;
  if (missing) return <p className="meimar-page-lede">{dictionary.listingPage.notFound}</p>;
  if (loaded === null) return <p className="meimar-page-lede">{dictionary.listingPage.loading}</p>;

  const { listing, detail, district, comparable } = loaded;

  return (
    <article className="meimar-listing-page">
      <p className="meimar-panel-place">
        {listing.district} · {listing.city}
      </p>
      <h1 className="tabular">{formatPrice(listing.price, dictionary)}</h1>
      {detail?.title != null && <p className="meimar-page-lede">{detail.title}</p>}

      <dl className="meimar-stats meimar-stats-wide">
        <div>
          <dt>{dictionary.listing.area}</dt>
          <dd className="tabular">{formatArea(listing.area, dictionary)}</dd>
        </div>
        {/* Positive, not merely non-null. The dataset stores zero rather than
            null for a plot of land's bedrooms, so a land listing rendered
            "Bedrooms 0" -- a fact about a building that does not exist. The
            same rule is applied in `ListingPanel`. */}
        {listing.beds !== null && listing.beds > 0 && (
          <div>
            <dt>{dictionary.listing.beds}</dt>
            <dd className="tabular">{listing.beds}</dd>
          </div>
        )}
      </dl>

      <ValuationCard
        dictionary={dictionary}
        locale={locale}
        listing={listing}
        comparable={comparable}
        medianErrorPct={metrics[marketOf(listing.estate_type)].medianErrorPct}
      />

      <ServicesList
        dictionary={dictionary}
        locale={locale}
        detail={detail ?? {}}
        radius={radius}
        onRadiusChange={setRadius}
      />

      {district !== null && <NeighborhoodCard dictionary={dictionary} stats={district} />}

      {detail?.content != null && detail.content !== "" && (
        <section>
          <h2>{dictionary.listing.description}</h2>
          <p className="meimar-panel-body">{detail.content}</p>
        </section>
      )}

      <Link href={`/${locale}/map`}>{dictionary.listingPage.backToMap}</Link>
    </article>
  );
}

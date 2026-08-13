"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  queryComparable,
  queryDistrict,
  queryListingDetail,
  type DistrictPrice,
  type DistrictStats,
  type ListingDetail,
  type PinListing,
} from "@/lib/duckdb/queries";
import { formatArea, formatNumber, formatPrice } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { marketOf, type ModelMetricsByMarket } from "@/lib/model-metrics";

import { NeighborhoodCard } from "./NeighborhoodCard";
import { ServicesList, type RadiusMetres } from "./ServicesList";
import { ValuationCard } from "./ValuationCard";

/**
 * Detail panel for a selected listing.
 *
 * Both the record and its district statistics are fetched on selection rather
 * than carried in the map data: the details file is ~155 MB, and only a single
 * row group of it is ever read.
 */

const AMENITY_KEYS = [
  "f_ac",
  "f_parking",
  "f_new",
  "f_pool",
  "f_kitchen",
  "f_driver",
  "f_basement",
  "f_garden",
  "f_two_entr",
  "f_corner",
  "f_near_masjid",
  "f_investment",
  "f_negotiable",
  "f_urgent",
  "f_near_park",
  "f_yard",
] as const;

type ListingPanelProps = {
  dictionary: Dictionary;
  locale: Locale;
  listing: PinListing;
  metrics: ModelMetricsByMarket;
  radius: RadiusMetres;
  onRadiusChange: (radius: RadiusMetres) => void;
  onClose: () => void;
};

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Counts and ages that are only worth printing when they are positive.
 *
 * The dataset stores zero rather than null for a plot of land's bedrooms,
 * bathrooms and building age, so a land listing rendered "Bedrooms 0 ·
 * Bathrooms 0 · Property age 0 years" -- three rows asserting facts about a
 * building that does not exist. Zero here means "not applicable", and the
 * honest rendering of "not applicable" is to omit the row.
 */
function readPositive(source: Record<string, unknown>, key: string): number | null {
  const value = readNumber(source, key);
  return value === null || value <= 0 ? null : value;
}

export function ListingPanel({
  dictionary,
  locale,
  listing,
  metrics,
  radius,
  onRadiusChange,
  onClose,
}: ListingPanelProps) {
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [district, setDistrict] = useState<DistrictStats | null>(null);
  const [comparable, setComparable] = useState<DistrictPrice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // Escape closes the panel, and opening it moves focus inside. Without this
  // the panel is reachable only with a mouse: a keyboard user tabs past the
  // whole map to reach it and has no way to dismiss it.
  //
  // Focus is also handed back on close. Without the restore, dismissing the
  // panel drops focus to <body> and the next Tab restarts from the top of the
  // document -- past the entire filter bar -- rather than from the map.
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Only if it is still in the document: the map redraws its canvas as
      // layers swap, and the element focus came from may be gone.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDistrict(null);
    setComparable(null);
    setError(null);

    async function load(): Promise<void> {
      try {
        // Three independent reads, issued together. Awaiting them in sequence
        // would stack three round trips on every pin click.
        const [record, stats, prices] = await Promise.all([
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
        setDetail(record);
        setDistrict(stats);
        setComparable(prices);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    listing.id,
    listing.city,
    listing.district,
    listing.estate_type,
    listing.estate_benefit,
  ]);

  const amenityLabels = dictionary.amenities as Record<string, string>;
  const activeAmenities =
    detail === null
      ? []
      : AMENITY_KEYS.filter((key) => readNumber(detail, key) === 1);

  return (
    <aside
      ref={panelRef}
      className="meimar-panel"
      // Labelled by the listing it describes rather than a generic string, so
      // a screen reader announces which listing opened.
      aria-label={`${listing.district} · ${listing.city}`}
      tabIndex={-1}
    >
      <header className="meimar-panel-header">
        <div>
          <p className="meimar-panel-price tabular">{formatPrice(listing.price, dictionary)}</p>
          <p className="meimar-panel-place">
            {listing.district} · {listing.city}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={dictionary.listing.close}>
          ✕
        </button>
      </header>

      {/* A URL for this listing, so it can be sent to someone. The panel is
          map state and has no address of its own. */}
      <Link className="meimar-panel-permalink" href={`/${locale}/listing/${listing.id}`}>
        {dictionary.listingPage.permalink}
      </Link>

      {error !== null && <p className="meimar-error">{error}</p>}

      {detail !== null && detail.title !== null && (
        <h2 className="meimar-panel-title">{detail.title}</h2>
      )}

      <ValuationCard
        dictionary={dictionary}
        locale={locale}
        listing={listing}
        comparable={comparable}
        medianErrorPct={metrics[marketOf(listing.estate_type)].medianErrorPct}
      />

      <dl className="meimar-stats">
        <div>
          <dt>{dictionary.listing.area}</dt>
          <dd className="tabular">{formatArea(listing.area, dictionary)}</dd>
        </div>
        {detail !== null &&
          (
            [
              ["beds", dictionary.listing.beds],
              ["livings", dictionary.listing.livings],
              ["wc", dictionary.listing.bathrooms],
            ] as const
          ).map(([key, label]) => {
            const value = readPositive(detail, key);
            return value === null ? null : (
              <div key={key}>
                <dt>{label}</dt>
                <dd className="tabular">{formatNumber(value)}</dd>
              </div>
            );
          })}
        {(
          [
            ["age", dictionary.listing.age, dictionary.listing.years],
            ["street_width", dictionary.listing.streetWidth, dictionary.units.m],
          ] as const
        ).map(([key, label, unit]) => {
          const value = detail === null ? null : readPositive(detail, key);
          return value === null ? null : (
            <div key={key}>
              <dt>{label}</dt>
              <dd className="tabular">
                {formatNumber(value)} {unit}
              </dd>
            </div>
          );
        })}
      </dl>

      {activeAmenities.length > 0 && (
        <section>
          <h3>{dictionary.listing.amenities}</h3>
          <ul className="meimar-amenities">
            {activeAmenities.map((key) => (
              <li key={key}>{amenityLabels[key]}</li>
            ))}
          </ul>
        </section>
      )}

      <ServicesList
        dictionary={dictionary}
        locale={locale}
        detail={detail ?? {}}
        radius={radius}
        onRadiusChange={onRadiusChange}
      />

      {district !== null && <NeighborhoodCard dictionary={dictionary} stats={district} />}

      {detail !== null && (
        <section>
          <h3>{dictionary.listing.description}</h3>
          <p className="meimar-panel-body">
            {detail.content !== null && detail.content !== ""
              ? detail.content
              : dictionary.listing.noDescription}
          </p>
        </section>
      )}

      <p className="meimar-disclaimer">{dictionary.disclaimer}</p>
    </aside>
  );
}

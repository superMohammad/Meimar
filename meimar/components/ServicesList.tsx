"use client";

import Link from "next/link";

import { formatDistance, formatRadius } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * Distances to nearby amenities, and how many lie within a chosen radius.
 *
 * There is no 0-100 score. It was a weighted mean across categories whose
 * OpenStreetMap coverage varies by a factor of three or more, which produced
 * one confident number out of data that cannot support one.
 *
 * Only four categories are shown, for the same reason: measured against
 * plausible urban reality, OSM maps landmarks well and everyday density badly.
 * Park, school, supermarket, cafe and gym were all off by 3-4x and were
 * removed rather than displayed. `api/services.py` holds the measurements.
 */

export const SERVICE_CATEGORIES = ["mosque", "hospital", "mall", "university"] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const RADII_M = [500, 1000, 2000] as const;

export type RadiusMetres = (typeof RADII_M)[number];

type ServicesListProps = {
  dictionary: Dictionary;
  locale: Locale;
  detail: Record<string, unknown>;
  radius: RadiusMetres;
  onRadiusChange: (radius: RadiusMetres) => void;
};

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ServicesList({
  dictionary,
  locale,
  detail,
  radius,
  onRadiusChange,
}: ServicesListProps) {
  const labels = dictionary.services.categories as Record<string, string>;

  return (
    <section className="meimar-services">
      <h3>{dictionary.services.title}</h3>

      <div className="meimar-radius-picker" role="group" aria-label={dictionary.services.radius}>
        {RADII_M.map((option) => (
          <button
            key={option}
            type="button"
            className={option === radius ? "is-active" : ""}
            aria-pressed={option === radius}
            onClick={() => onRadiusChange(option)}
          >
            {formatRadius(option, dictionary)}
          </button>
        ))}
      </div>

      <ul className="meimar-services-list">
        {SERVICE_CATEGORIES.map((category) => {
          const distance = readNumber(detail, `dist_${category}_m`);
          const count = readNumber(detail, `count_${category}_${radius}m`);

          return (
            <li key={category}>
              <span className="meimar-service-name">{labels[category]}</span>
              <span className="meimar-service-distance tabular">
                {distance === null ? "—" : formatDistance(distance, dictionary)}
              </span>
              <span className="meimar-service-count tabular">
                {count === null ? "—" : `${count} ${dictionary.services.facilities}`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="meimar-disclaimer">
        {dictionary.services.disclaimer}{" "}
        <Link href={`/${locale}/methodology`}>{dictionary.nav.methodology}</Link>
      </p>
    </section>
  );
}

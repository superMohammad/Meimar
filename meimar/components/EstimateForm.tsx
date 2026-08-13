"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { FilterBounds } from "@/lib/filter-bounds";
import { formatDistance, formatPrice } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";

import type { PickedPoint } from "./LocationPicker";

// Leaflet touches `window` at module scope, so the picker cannot be rendered
// on the server -- the same reason `MapExplorer` loads the main map this way.
const LocationPicker = dynamic(
  () => import("./LocationPicker").then((module) => module.LocationPicker),
  { ssr: false },
);

/**
 * The free-form estimator: price a property that is not listed.
 *
 * This is the one case that cannot be precomputed. Estimates for existing
 * listings are baked into Parquet at build time, but a property the user
 * describes has never been seen, so the request goes to the model service.
 */

type ServiceDistance = {
  category: string;
  distance_m: number;
  count_500m: number;
  count_1000m: number;
  count_2000m: number;
};

type EstimateResult = {
  estimate: number;
  estimate_low: number;
  estimate_high: number;
  market: "built" | "land";
  unknown_city: boolean;
  unknown_district: boolean;
  services: ServiceDistance[] | null;
};

type EstimateFormProps = {
  dictionary: Dictionary;
  bounds: FilterBounds;
};

const NUMERIC_FIELDS = ["bedrooms", "living_rooms", "bathrooms", "street_width_m"] as const;

/**
 * The property types the estimate service will actually price.
 *
 * This must stay identical to `EstateType` in `api/schemas.py`. The form used
 * to offer all fifteen types in the dataset while the service accepts nine, so
 * choosing an office or a warehouse produced a 422 whose raw pydantic body was
 * printed into the page. The models are fitted on sale listings, and the six
 * missing types are rental-dominated -- they were never trained, so there is
 * nothing to offer.
 */
const ESTIMABLE_TYPES: readonly string[] = [
  "apartment",
  "building",
  "esterahah",
  "farm",
  "floor",
  "house",
  "land",
  "store",
  "villa",
];

/**
 * Turn a failed response into something the reader can act on.
 *
 * The raw body is kept as a suffix rather than dropped: when the cause is not
 * one of the known ones, a truncated server message is still the fastest route
 * to understanding what went wrong.
 */
function describeFailure(
  status: number,
  body: string,
  dictionary: Dictionary,
): string {
  if (status === 422) return dictionary.estimate.errorUnsupportedType;
  if (status === 503 || status === 502 || status === 504) {
    return dictionary.estimate.errorUnavailable;
  }
  return `${dictionary.estimate.error} (${status}): ${body.slice(0, 200)}`;
}

export function EstimateForm({ dictionary, bounds }: EstimateFormProps) {
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [estateType, setEstateType] = useState("villa");
  const [areaM2, setAreaM2] = useState("");
  const [numeric, setNumeric] = useState<Record<string, string>>({});
  const [point, setPoint] = useState<PickedPoint | null>(null);

  const [result, setResult] = useState<EstimateResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districts = bounds.cities.find((entry) => entry.city === city)?.districts ?? [];
  const isLand = estateType === "land";
  const estateTypes = bounds.estate_types.filter((type) => ESTIMABLE_TYPES.includes(type));

  function parse(value: string | undefined): number | null {
    if (value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          district,
          estate_type: estateType,
          area_m2: parse(areaM2),
          // Only sent when the user actually dropped a pin. The service
          // answers with per-point service distances when it has coordinates
          // and omits them when it does not.
          ...(point === null ? {} : { lat: point.lat, lng: point.lng }),
          // Land has no bedrooms or bathrooms; sending zeros would assert
          // something the user never said, so they are omitted entirely and
          // reach the model as missing.
          ...(isLand
            ? {}
            : Object.fromEntries(
                NUMERIC_FIELDS.map((field) => [field, parse(numeric[field])]),
              )),
        }),
      });

      if (!response.ok) {
        // Named where the cause is known, raw where it is not. The status code
        // and a slice of JSON told the reader nothing they could act on.
        throw new Error(
          describeFailure(response.status, await response.text(), dictionary),
        );
      }
      setResult((await response.json()) as EstimateResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  const categoryLabels = dictionary.services.categories as Record<string, string>;

  return (
    <div className="meimar-estimate">
      <form onSubmit={submit} className="meimar-estimate-form">
        <label className="meimar-field">
          <span>{dictionary.filters.city}</span>
          <select
            required
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setDistrict("");
            }}
          >
            <option value="">—</option>
            {bounds.cities.map((entry) => (
              <option key={entry.city} value={entry.city}>
                {entry.city}
              </option>
            ))}
          </select>
        </label>

        <label className="meimar-field">
          <span>{dictionary.filters.district}</span>
          <select
            required
            value={district}
            disabled={city === ""}
            onChange={(event) => setDistrict(event.target.value)}
          >
            <option value="">—</option>
            {districts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="meimar-field">
          <span>{dictionary.filters.estateType}</span>
          <select value={estateType} onChange={(event) => setEstateType(event.target.value)}>
            {estateTypes.map((type) => {
              const labels = dictionary.estateTypes as Record<string, string | undefined>;
              return (
                <option key={type} value={type}>
                  {labels[type] ?? type}
                </option>
              );
            })}
          </select>
        </label>

        <label className="meimar-field">
          <span>
            {dictionary.listing.area} ({dictionary.units.sqm})
          </span>
          <input
            required
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min={1}
            value={areaM2}
            onChange={(event) => setAreaM2(event.target.value)}
          />
        </label>

        {!isLand &&
          (
            [
              ["bedrooms", dictionary.listing.beds],
              ["living_rooms", dictionary.listing.livings],
              ["bathrooms", dictionary.listing.bathrooms],
              ["street_width_m", dictionary.listing.streetWidth],
            ] as const
          ).map(([field, label]) => (
            <label className="meimar-field" key={field}>
              <span>{label}</span>
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                value={numeric[field] ?? ""}
                onChange={(event) =>
                  setNumeric((current) => ({ ...current, [field]: event.target.value }))
                }
              />
            </label>
          ))}

        <fieldset className="meimar-estimate-location">
          <legend>{dictionary.estimate.pickLocation}</legend>
          <p className="meimar-disclaimer">{dictionary.estimate.locationHint}</p>
          <LocationPicker dictionary={dictionary} value={point} onChange={setPoint} />
          {point !== null ? (
            <p className="meimar-estimate-point">
              <span className="tabular">
                {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
              </span>
              <button type="button" onClick={() => setPoint(null)}>
                {dictionary.estimate.clearLocation}
              </button>
            </p>
          ) : null}
        </fieldset>

        <button type="submit" className="meimar-estimate-submit" disabled={pending}>
          {pending ? dictionary.estimate.calculating : dictionary.estimate.submit}
        </button>
      </form>

      {/* Both the failure and the answer arrive after the request, so they are
          announced. Without this a screen-reader user submits the form and is
          told nothing at all.

          The live region is this wrapper, which is always in the document.
          `aria-live` used to sit on the result section itself -- a node that
          appears at the same moment as its content, which most screen readers
          do not announce because there was no region there to change. */}
      <div aria-live="polite">
        {error !== null && (
          <p className="meimar-error-inline" role="alert">
            {error}
          </p>
        )}

        {result !== null && (
        <section className="meimar-estimate-result">
          <h2>{dictionary.estimate.result}</h2>
          <p className="meimar-estimate-value tabular">
            {formatPrice(result.estimate, dictionary)}
          </p>
          <p className="meimar-valuation-range tabular">
            {dictionary.valuation.range}: {formatPrice(result.estimate_low, dictionary)} –{" "}
            {formatPrice(result.estimate_high, dictionary)}
          </p>

          {result.unknown_city && (
            <p className="meimar-warn">{dictionary.estimate.unknownCity}</p>
          )}
          {result.unknown_district && (
            <p className="meimar-warn">{dictionary.estimate.unknownDistrict}</p>
          )}

          {result.services !== null && (
            <>
              <h3>{dictionary.services.title}</h3>
              <ul className="meimar-services-list">
                {result.services.map((service) => (
                  <li key={service.category}>
                    <span className="meimar-service-name">
                      {categoryLabels[service.category] ?? service.category}
                    </span>
                    <span className="meimar-service-distance tabular">
                      {formatDistance(service.distance_m, dictionary)}
                    </span>
                    <span className="meimar-service-count tabular">
                      {service.count_1000m} {dictionary.services.facilities}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="meimar-disclaimer">{dictionary.services.disclaimer}</p>
            </>
          )}

          <p className="meimar-disclaimer">{dictionary.valuation.basis}</p>
        </section>
        )}
      </div>
    </div>
  );
}

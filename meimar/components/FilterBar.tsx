"use client";

import { memo, useId, useMemo } from "react";

import {
  EMPTY_FILTERS,
  NEAR_RADII_KM,
  type ListingFilters,
  type Purpose,
} from "@/lib/duckdb/filters";
import type { FilterBounds } from "@/lib/filter-bounds";
import { interpolate, type Dictionary } from "@/lib/i18n";

/**
 * The filter bar: two controls inline, the rest behind a disclosure.
 *
 * Only purpose and property type stay in the header. They are the two that
 * gate the price layer -- `MapExplorer` refuses to draw it without a type --
 * so burying them would make the layer look broken. Everything else lives in a
 * panel, because seven fields in a header wrapped to three or four rows and ate
 * a quarter of the viewport at every screen size, on a product whose whole
 * premise is the map.
 *
 * The panel is a native popover. That buys top-layer stacking, light dismiss,
 * and Escape-to-close from the platform, so this component stays markup and
 * CSS instead of growing open/close state, an outside-click listener and a
 * focus trap. CSS decides whether it reads as a dropdown or a bottom sheet,
 * keyed on `pointer: coarse` rather than width -- a tablet is a touch device at
 * any width.
 *
 * District options are scoped to the selected city, because district names are
 * not unique across cities -- 1,114 names cover 1,979 real (city, district)
 * pairs. Offering a flat district list would let a user pick a name that means
 * something different in six places.
 */

type FilterBarProps = {
  dictionary: Dictionary;
  bounds: FilterBounds;
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
  /** True while the map is waiting for the user to place the distance point. */
  pickingPoint: boolean;
  onPickPoint: (picking: boolean) => void;
};

function estateTypeLabel(dictionary: Dictionary, key: string): string {
  const labels = dictionary.estateTypes as Record<string, string | undefined>;
  return labels[key] ?? key;
}

/**
 * How many filters are narrower than "everything".
 *
 * Drives the badge on the trigger. Without it the panel hides its own state:
 * a user who set a price cap and scrolled away has no way to see that the
 * result count is filtered.
 */
function activeFilterCount(filters: ListingFilters): number {
  return [
    filters.purpose !== null,
    filters.estateTypes.length > 0,
    filters.priceMin !== null,
    filters.priceMax !== null,
    filters.areaMin !== null,
    filters.areaMax !== null,
    filters.minBeds !== null,
    filters.city !== null,
    filters.district !== null,
    filters.near !== null,
  ].filter(Boolean).length;
}

/**
 * Memoised: the map's status line updates several times per query and
 * re-renders the whole header with it. Without this, every one of those
 * re-renders reconciles a city select holding up to 166 options.
 */
export const FilterBar = memo(function FilterBar({
  dictionary,
  bounds,
  filters,
  onChange,
  pickingPoint,
  onPickPoint,
}: FilterBarProps) {
  const panelId = useId();

  const districts = useMemo(() => {
    if (filters.city === null) return [];
    return bounds.cities.find((entry) => entry.city === filters.city)?.districts ?? [];
  }, [bounds.cities, filters.city]);

  function update(patch: Partial<ListingFilters>): void {
    onChange({ ...filters, ...patch });
  }

  function parseNumber(value: string): number | null {
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const activeCount = activeFilterCount(filters);

  return (
    <div className="meimar-filters">
      <button
        type="button"
        className="meimar-filters-trigger"
        popoverTarget={panelId}
        aria-label={
          activeCount === 0
            ? dictionary.filters.title
            : `${dictionary.filters.title} — ${interpolate(dictionary.filters.activeCount, {
                count: String(activeCount),
              })}`
        }
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
          <path
            d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span>{dictionary.filters.title}</span>
        {activeCount > 0 ? (
          <span className="meimar-filters-badge tabular" aria-hidden="true">
            {activeCount}
          </span>
        ) : null}
      </button>

      <div id={panelId} popover="auto" className="meimar-filters-panel">
        <header className="meimar-filters-panel-head">
          <h2>{dictionary.filters.title}</h2>
          <button
            type="button"
            popoverTarget={panelId}
            popoverTargetAction="hide"
            aria-label={dictionary.filters.close}
          >
            ✕
          </button>
        </header>

        <div className="meimar-filters-panel-body">
          {/* Purpose and type lead, because they are the two that gate the
              price layer. They were inline in the header until 320px proved
              it impossible: two selects plus the trigger need ~292px and the
              header could spare ~150, so the trigger was pushed off-screen at
              x=-41 and a select landed on top of the language switch. */}
          <label className="meimar-field">
            <span>{dictionary.filters.purpose}</span>
            <select
              value={filters.purpose ?? ""}
              onChange={(event) =>
                update({
                  purpose: event.target.value === "" ? null : (event.target.value as Purpose),
                })
              }
            >
              <option value="">{dictionary.filters.all}</option>
              <option value="sell">{dictionary.filters.sell}</option>
              <option value="rental">{dictionary.filters.rental}</option>
            </select>
          </label>

          <label className="meimar-field">
            <span>{dictionary.filters.estateType}</span>
            <select
              value={filters.estateTypes[0] ?? ""}
              onChange={(event) =>
                update({ estateTypes: event.target.value === "" ? [] : [event.target.value] })
              }
            >
              <option value="">{dictionary.filters.all}</option>
              {bounds.estate_types.map((type) => (
                <option key={type} value={type}>
                  {estateTypeLabel(dictionary, type)}
                </option>
              ))}
            </select>
          </label>

          <label className="meimar-field">
            <span>{dictionary.filters.city}</span>
            <select
              value={filters.city ?? ""}
              onChange={(event) =>
                // Changing city must clear the district: the old district almost
                // certainly does not exist in the new city.
                update({
                  city: event.target.value === "" ? null : event.target.value,
                  district: null,
                })
              }
            >
              <option value="">{dictionary.filters.all}</option>
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
              value={filters.district ?? ""}
              disabled={filters.city === null}
              onChange={(event) =>
                update({ district: event.target.value === "" ? null : event.target.value })
              }
            >
              <option value="">{dictionary.filters.all}</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>

          {/* A range is two controls, so it is a group rather than a label: a
              `<label>` wrapping both binds only to the first, which left every
              "maximum" input in the bar with no accessible name at all. */}
          <div className="meimar-field meimar-field-range" role="group" aria-labelledby="filter-price">
            <span id="filter-price">{dictionary.filters.priceRange}</span>
            <div className="meimar-range">
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                max={bounds.price_max}
                placeholder="0"
                aria-label={`${dictionary.filters.priceRange} — ${dictionary.filters.min}`}
                value={filters.priceMin ?? ""}
                onChange={(event) => update({ priceMin: parseNumber(event.target.value) })}
              />
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                max={bounds.price_max}
                placeholder={bounds.price_max.toLocaleString("en-US")}
                aria-label={`${dictionary.filters.priceRange} — ${dictionary.filters.max}`}
                value={filters.priceMax ?? ""}
                onChange={(event) => update({ priceMax: parseNumber(event.target.value) })}
              />
            </div>
          </div>

          <div className="meimar-field meimar-field-range" role="group" aria-labelledby="filter-area">
            <span id="filter-area">{dictionary.filters.areaRange}</span>
            <div className="meimar-range">
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                placeholder="0"
                aria-label={`${dictionary.filters.areaRange} — ${dictionary.filters.min}`}
                value={filters.areaMin ?? ""}
                onChange={(event) => update({ areaMin: parseNumber(event.target.value) })}
              />
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                placeholder={bounds.area_max.toLocaleString("en-US")}
                aria-label={`${dictionary.filters.areaRange} — ${dictionary.filters.max}`}
                value={filters.areaMax ?? ""}
                onChange={(event) => update({ areaMax: parseNumber(event.target.value) })}
              />
            </div>
          </div>

          <label className="meimar-field">
            <span>{dictionary.filters.minBeds}</span>
            <select
              value={filters.minBeds ?? ""}
              onChange={(event) => update({ minBeds: parseNumber(event.target.value) })}
            >
              <option value="">{dictionary.filters.all}</option>
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}+
                </option>
              ))}
            </select>
          </label>

          {/* Distance search.

              Straight-line, and it says so rather than implying a drive time
              the product cannot compute: there is no routing service here, and
              a fabricated "20 minutes" would be exactly the kind of confident
              wrong number the rest of this codebase refuses to print. */}
          <section className="meimar-near">
            <h3>{dictionary.near.title}</h3>

            {filters.near === null ? (
              <button
                type="button"
                className="meimar-near-pick"
                aria-pressed={pickingPoint}
                onClick={() => onPickPoint(!pickingPoint)}
              >
                {pickingPoint ? dictionary.near.cancel : dictionary.near.pick}
              </button>
            ) : (
              <>
                <p className="meimar-near-active">
                  <span className="tabular">
                    {filters.near.lat.toFixed(4)}, {filters.near.lng.toFixed(4)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, near: null })}
                  >
                    {dictionary.near.clear}
                  </button>
                </p>

                <div
                  className="meimar-near-radii"
                  role="group"
                  aria-label={dictionary.near.radius}
                >
                  {NEAR_RADII_KM.map((km) => (
                    <button
                      key={km}
                      type="button"
                      className={filters.near?.radiusKm === km ? "is-active" : ""}
                      aria-pressed={filters.near?.radiusKm === km}
                      onClick={() =>
                        filters.near !== null &&
                        onChange({ ...filters, near: { ...filters.near, radiusKm: km } })
                      }
                    >
                      {km} {dictionary.units.km}
                    </button>
                  ))}
                </div>
              </>
            )}

            {pickingPoint && filters.near === null ? (
              <p className="meimar-near-hint" role="status">
                {dictionary.near.picking}
              </p>
            ) : null}

            <p className="meimar-disclaimer">{dictionary.near.note}</p>
          </section>
        </div>

        <footer className="meimar-filters-panel-foot">
          {/* Only offered when something is set: a permanently visible reset on
              an unfiltered map is a control that does nothing. */}
          {activeCount > 0 ? (
            <button
              type="button"
              className="meimar-filter-reset"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              {dictionary.filters.reset}
            </button>
          ) : null}
          {/* Filters apply as they change, so this only dismisses. It exists
              because a full-height sheet on a phone needs an obvious way out
              that is not a small ✕ in the corner. */}
          <button
            type="button"
            className="meimar-filters-apply"
            popoverTarget={panelId}
            popoverTargetAction="hide"
          >
            {dictionary.filters.apply}
          </button>
        </footer>
      </div>
    </div>
  );
});

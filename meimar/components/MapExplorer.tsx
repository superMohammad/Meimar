"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useState } from "react";

import {
  filtersFromParams,
  overlayFromParams,
  paramsFromFilters,
} from "@/lib/duckdb/filter-params";
import { BrandLink } from "./BrandMark";
import { registerEngineCache } from "@/lib/duckdb/engine-cache";
import type { ListingFilters } from "@/lib/duckdb/filters";
import type { PinListing } from "@/lib/duckdb/queries";
import type { FilterBounds } from "@/lib/filter-bounds";
import type { ModelMetricsByMarket } from "@/lib/model-metrics";
import { formatNumber } from "@/lib/format";
import { interpolate, type Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

import { FilterBar } from "./FilterBar";
import { ListingPanel } from "./ListingPanel";
import type { RadiusMetres } from "./ServicesList";
import { LayerControl, type OverlayName } from "./map/LayerControl";
import type { MapViewState } from "./map/MapView";

/**
 * Client shell around the map: owns filter state, the selected listing, and the
 * services radius.
 *
 * The map is loaded with `ssr: false` because Leaflet reaches for `window` at
 * module scope, and DuckDB-WASM only exists in the browser.
 */

const MapView = dynamic(
  () => import("./map/MapView").then((module) => module.MapView),
  { ssr: false },
);

type MapExplorerProps = {
  locale: Locale;
  dictionary: Dictionary;
  bounds: FilterBounds;
  metrics: ModelMetricsByMarket;
};

export function MapExplorer({ locale, dictionary, bounds, metrics }: MapExplorerProps) {
  const searchParams = useSearchParams();

  // Initial state comes from the URL, so a shared link opens the same map.
  // Lazy initialisers: parsing runs once, not on every render.
  const [filters, setFilters] = useState<ListingFilters>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [overlay, setOverlay] = useState<OverlayName>(() =>
    overlayFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [selected, setSelected] = useState<PinListing | null>(null);
  const [radius, setRadius] = useState<RadiusMetres>(1000);
  const [overlayBreaks, setOverlayBreaks] = useState<number[]>([]);

  // The map is waiting for the user to place the distance-search point. Held
  // here rather than in the filter bar because the click that answers it lands
  // on the map, which is a sibling.
  const [pickingPoint, setPickingPoint] = useState(false);

  // Registered here rather than in the app shell: the engine is only ever
  // loaded by the map, so nothing is gained by asking every other page to set
  // up a service worker. Fire-and-forget, and nothing below waits on it.
  useEffect(registerEngineCache, []);

  // Mirror state into the address bar. `replaceState` rather than a router
  // push: every filter tweak would otherwise add a history entry, and Back
  // would then walk through each keystroke instead of leaving the map.
  //
  // Deferred, because a price typed as "1000000" is seven separate filter
  // states and the address bar does not need to see six of them.
  const deferredFilters = useDeferredValue(filters);
  useEffect(() => {
    const query = paramsFromFilters(deferredFilters, overlay).toString();
    window.history.replaceState(
      null,
      "",
      query === "" ? window.location.pathname : `?${query}`,
    );
  }, [deferredFilters, overlay]);
  const [viewState, setViewState] = useState<MapViewState>({
    tier: { kind: "heat" },
    shown: 0,
    total: 0,
    loading: true,
  });

  const otherLocale: Locale = locale === "ar" ? "en" : "ar";

  const isCapped = viewState.tier.kind === "pins" && viewState.total > viewState.shown;

  // Stable identities. `viewState` changes several times per query, so without
  // these the memoised filter bar -- and its city select of up to 166 options
  // -- would re-render on every status-line update.
  const changeFilters = useCallback((next: ListingFilters) => {
    setFilters(next);
    setSelected(null);
  }, []);

  // Clicking a shaded district filters to it, which is what a reader who has
  // just found an interesting colour wants next. The handler was previously
  // wired to a no-op, so the whole layer looked inert.
  const selectDistrict = useCallback((city: string, district: string) => {
    setFilters((current) => ({ ...current, city, district }));
    setSelected(null);
  }, []);

  // A placed point ends pick mode and starts the search at the middle radius,
  // so the first result set is neither a handful nor half the country.
  const placeNearPoint = useCallback((lat: number, lng: number) => {
    setFilters((current) => ({
      ...current,
      near: { lat, lng, radiusKm: current.near?.radiusKm ?? 5 },
    }));
    setPickingPoint(false);
    setSelected(null);
  }, []);

  return (
    <div className="meimar-shell">
      <header className="meimar-header">
        {/* Prefetch off: the landing page loads site stats, the district list
            and model metrics, which the map should not fetch on a hover. */}
        <BrandLink locale={locale} dictionary={dictionary} prefetch={false} />

        <FilterBar
          dictionary={dictionary}
          bounds={bounds}
          filters={filters}
          onChange={changeFilters}
          pickingPoint={pickingPoint}
          onPickPoint={setPickingPoint}
        />

        <Link className="meimar-locale-switch" href={`/${otherLocale}`} prefetch={false}>
          {dictionary.nav.language}
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="meimar-body">
        <MapView
          locale={locale}
          dictionary={dictionary}
          filters={filters}
          selectedListing={selected}
          radiusMetres={selected === null ? null : radius}
          overlay={overlay}
          onSelectListing={setSelected}
          onSelectDistrict={selectDistrict}
          pickingPoint={pickingPoint}
          onPlaceNearPoint={placeNearPoint}
          near={filters.near}
          onStateChange={setViewState}
          onOverlayBreaks={setOverlayBreaks}
        />

        {/* One flow, so the legend growing a row cannot push the layer control
            onto the status pill. On wider screens each child keeps its own
            corner; the stacking only applies on phones. */}
        <div className="meimar-map-controls">
          <LayerControl
            dictionary={dictionary}
            active={overlay}
            onChange={setOverlay}
            breaks={overlayBreaks}
            blockedReason={
              overlay === "price" && filters.estateTypes.length === 0
                ? dictionary.priceLayer.needsType
                : null
            }
          />

          <div className="meimar-status" role="status" aria-live="polite">
          {viewState.loading ? (
            dictionary.map.loading
          ) : viewState.tier.kind === "heat" ? (
            <>
              <strong className="tabular">{formatNumber(viewState.total)}</strong>{" "}
              {dictionary.map.listingsInView} · {dictionary.map.zoomForPins}
            </>
          ) : isCapped ? (
            // The cap is stated, never silent: at street level a dense
            // viewport holds tens of thousands of listings and only the pin
            // cap is drawn.
            interpolate(dictionary.map.showingCapped, {
              shown: formatNumber(viewState.shown),
              total: formatNumber(viewState.total),
            })
          ) : (
            <>
              <strong className="tabular">{formatNumber(viewState.total)}</strong>{" "}
              {dictionary.map.listingsInView}
            </>
          )}
          </div>
        </div>

        {selected !== null && (
          <ListingPanel
            dictionary={dictionary}
            locale={locale}
            listing={selected}
            metrics={metrics}
            radius={radius}
            onRadiusChange={setRadius}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}

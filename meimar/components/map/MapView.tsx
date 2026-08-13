"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  heatPointLimit,
  pinLimit,
  queryDistrictPrices,
  queryHeatPoints,
  queryPins,
  queryViewportTotal,
  tierForZoom,
  type MapTier,
  type PinListing,
} from "@/lib/duckdb/queries";
import type { ListingFilters, MapBounds, NearFilter } from "@/lib/duckdb/filters";
import { formatNumber } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

import {
  applyChoroplethBreaks,
  buildChoroplethLayer,
  buildHeatLayer,
  buildPinLayer,
  buildNearCircle,
  buildRadiusCircle,
  districtCentres,
  quantileBreaks,
  shadesByKey,
  type DistrictShade,
} from "./layers";
import type { OverlayName } from "./LayerControl";

import "leaflet/dist/leaflet.css";

/**
 * The map. Owns one Leaflet instance for the lifetime of the page and swaps a
 * single data layer as the viewport and filters change.
 *
 * Leaflet is driven directly rather than through react-leaflet: the map is a
 * long-lived imperative object, and a wrapper would add a version-coupled
 * dependency while still needing escape hatches for the canvas renderer and
 * the heat layer.
 */

/**
 * Basemap options.
 *
 * Imagery is the default: this is a property map, and aerial ground shows the
 * plot, the surrounding build-out and whether a "villa" is a finished street or
 * bare desert -- none of which a vector style can convey. It carries no place
 * names of its own, so it is paired with a transparent reference overlay.
 *
 * The light vector style is kept because imagery is the wrong choice for
 * reading dense street names, and swapping is the first thing a user will want.
 * Both are declared here so that becomes a one-line change rather than a hunt.
 */
const TILE_LAYERS = {
  imagery: [
    {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      maxZoom: 19,
    },
    {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "",
      maxZoom: 19,
    },
  ],
  light: [
    {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    },
  ],
} as const;

const BASEMAP: keyof typeof TILE_LAYERS = "imagery";

/** Below this width the map is on a phone and tiles are budgeted accordingly. */
const SMALL_SCREEN_PX = 720;

function buildBaseLayers(name: keyof typeof TILE_LAYERS): L.TileLayer[] {
  const isSmall = window.innerWidth <= SMALL_SCREEN_PX;

  // The place-names overlay is a second full set of tile requests over the
  // same ground. On a phone -- where every tile is also being fetched at
  // device-pixel-ratio 3 -- that doubling is the single largest network cost
  // after the engine itself, to add labels that are barely legible at that
  // size anyway. Imagery keeps the screen; names return on a larger one.
  const specs = isSmall ? TILE_LAYERS[name].slice(0, 1) : TILE_LAYERS[name];

  return specs.map((spec) =>
    L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: spec.maxZoom,
      // Hold fewer off-screen tiles in memory, and do not chase tiles through
      // a fling -- fetch them once the pan settles. Both matter far more on a
      // phone, where memory is tighter and the network is the bottleneck.
      keepBuffer: isSmall ? 1 : 2,
      updateWhenIdle: isSmall,
      ...("subdomains" in spec ? { subdomains: spec.subdomains } : {}),
    }),
  );
}

// The country itself, used to frame the first paint. A fixed initial zoom
// cannot do this: zoom 6 fills a laptop window and shows half of Asia on a
// wide monitor, so the opening view is fitted to these bounds instead.
const SAUDI_VIEW_BOUNDS: L.LatLngBoundsExpression = [
  [16.0, 34.5],
  [32.5, 55.7],
];

// Padded well beyond the country so panning to a border city does not fight
// the viscosity, while still preventing a drift to the middle of the Atlantic.
const SAUDI_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [12.0, 29.0],
  [37.0, 61.0],
];

/** Viewport changes settle before a query runs, so a pan is one query not thirty. */
const QUERY_DEBOUNCE_MS = 250;

/**
 * Fewest districts on screen that can carry their own colour scale.
 *
 * Below this the ramp is re-fitted to a handful of neighbours, which turns a
 * 200 SAR/m² spread into the full five-colour range and implies a difference
 * that is not there. Under the threshold the national scale is used instead:
 * less resolution, but honest about it.
 */
const MIN_DISTRICTS_FOR_LOCAL_SCALE = 8;

export type MapViewState = {
  tier: MapTier;
  shown: number;
  total: number;
  loading: boolean;
};

/** District outlines, fetched once and reused for every price-layer redraw. */
let cachedOutlines: GeoJSON.FeatureCollection | null = null;

async function loadOutlines(): Promise<GeoJSON.FeatureCollection> {
  if (cachedOutlines) return cachedOutlines;
  const response = await fetch("/data/districts.geojson");
  if (!response.ok) throw new Error(`districts.geojson: ${response.status}`);
  cachedOutlines = (await response.json()) as GeoJSON.FeatureCollection;
  return cachedOutlines;
}

type MapViewProps = {
  locale: Locale;
  dictionary: Dictionary;
  filters: ListingFilters;
  selectedListing: PinListing | null;
  radiusMetres: number | null;
  /** Which overlay is active; "none" draws no district shading. */
  overlay: OverlayName;
  onSelectListing: (listing: PinListing) => void;
  onSelectDistrict: (city: string, district: string) => void;
  /** While true, a click on the map places the distance-search point. */
  pickingPoint: boolean;
  onPlaceNearPoint: (lat: number, lng: number) => void;
  /** The active distance search, drawn as a circle. */
  near: NearFilter | null;
  onStateChange: (state: MapViewState) => void;
  onOverlayBreaks: (breaks: number[]) => void;
};

function boundsOf(map: L.Map): MapBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

export function MapView({
  locale,
  dictionary,
  filters,
  selectedListing,
  radiusMetres,
  overlay,
  onSelectListing,
  onSelectDistrict,
  pickingPoint,
  onPlaceNearPoint,
  near,
  onStateChange,
  onOverlayBreaks,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayerRef = useRef<L.Layer | null>(null);
  const radiusLayerRef = useRef<L.Circle | null>(null);
  const nearLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.GeoJSON | null>(null);

  // The pins currently drawn. Selecting one only changes how it is drawn, so
  // the ring is redrawn from this rather than by asking DuckDB for the same
  // rows again -- which is what used to happen on every single click.
  const pinsRef = useRef<readonly PinListing[]>([]);

  // What the active overlay is shaded from. Held so the colour scale can be
  // re-fitted to the viewport on pan without re-running the district query.
  const overlayShadesRef = useRef<Map<string, DistrictShade>>(new Map());
  const overlayCentresRef = useRef<Map<string, L.LatLng>>(new Map());
  const nationalBreaksRef = useRef<number[]>([]);
  // Read inside `refresh`, which is deliberately stable, so the active overlay
  // reaches it without rebuilding the viewport listeners.
  const overlayRef = useRef<OverlayName>(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The latest request wins. Without this, a slow country-wide aggregation can
  // land after a fast street-level query and repaint the map with stale data.
  const requestIdRef = useRef(0);

  const [error, setError] = useState<string | null>(null);

  // Callbacks are read through a ref so that refresh() stays stable and the
  // viewport listeners are attached exactly once.
  const handlersRef = useRef({
    onSelectListing,
    onSelectDistrict,
    onPlaceNearPoint,
    onStateChange,
    onOverlayBreaks,
  });
  useEffect(() => {
    handlersRef.current = {
      onSelectListing,
      onSelectDistrict,
      onPlaceNearPoint,
      onStateChange,
      onOverlayBreaks,
    };
  }, [onSelectListing, onSelectDistrict, onPlaceNearPoint, onStateChange, onOverlayBreaks]);

  // Read by the map's click handler, which is attached once. Without the ref
  // the handler would capture `pickingPoint` from the render that created it
  // and answer every click with `false`.
  const pickingRef = useRef(pickingPoint);
  useEffect(() => {
    pickingRef.current = pickingPoint;
  }, [pickingPoint]);

  const stateRef = useRef({ filters, selectedListing, locale, dictionary });
  useEffect(() => {
    stateRef.current = { filters, selectedListing, locale, dictionary };
  }, [filters, selectedListing, locale, dictionary]);

  /**
   * Re-fit the price ramp to the districts currently on screen.
   *
   * This is the difference between a layer that says something and one that
   * does not. Quantiles of all 1,342 districts put 88% of Riyadh's land
   * listings in the top two of five colours -- the whole city one shade,
   * because it is expensive relative to the country. Re-quantiling over what
   * is in view spends the five colours on the differences the user is actually
   * looking at.
   */
  const rescaleOverlay = useCallback(() => {
    const map = mapRef.current;
    const layer = overlayLayerRef.current;
    if (map === null || layer === null) return;

    const byKey = overlayShadesRef.current;
    const centres = overlayCentresRef.current;
    const viewport = map.getBounds();

    const visible: number[] = [];
    for (const [key, shade] of byKey) {
      const centre = centres.get(key);
      if (centre !== undefined && viewport.contains(centre)) visible.push(shade.value);
    }

    const breaks =
      visible.length >= MIN_DISTRICTS_FOR_LOCAL_SCALE
        ? quantileBreaks(visible)
        : nationalBreaksRef.current;

    applyChoroplethBreaks(layer, byKey, breaks);
    handlersRef.current.onOverlayBreaks(breaks);
  }, []);

  /** Redraw the pins already in hand, so selection costs no query. */
  const redrawPins = useCallback(() => {
    const map = mapRef.current;
    if (map === null) return;

    const current = stateRef.current;
    swapDataLayer(
      map,
      dataLayerRef,
      buildPinLayer(
        pinsRef.current,
        map.getZoom(),
        current.locale,
        current.dictionary,
        current.selectedListing?.id ?? null,
        (listing) => handlersRef.current.onSelectListing(listing),
      ),
    );
  }, []);

  const refresh = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const requestId = ++requestIdRef.current;
    const current = stateRef.current;
    const bounds = boundsOf(map);
    const zoom = map.getZoom();
    const tier = tierForZoom(zoom);

    handlersRef.current.onStateChange({ tier, shown: 0, total: 0, loading: true });

    try {
      if (tier.kind === "heat") {
        const [points, total] = await Promise.all([
          queryHeatPoints(bounds, current.filters, heatPointLimit()),
          queryViewportTotal(bounds, current.filters),
        ]);
        if (requestId !== requestIdRef.current) return;
        pinsRef.current = [];

        // The density surface is suppressed while the price layer is on. Both
        // are area fills covering the same ground, and stacked they read as one
        // muddy wash in which neither density nor price is legible.
        swapDataLayer(
          map,
          dataLayerRef,
          overlayRef.current === "price"
            ? L.layerGroup()
            : buildHeatLayer(points, zoom),
        );

        // `shown` is the sample size, `total` the real count. The status bar
        // reports the total: the sample is a rendering detail, and telling the
        // user 25,000 when 291,510 match would be wrong.
        handlersRef.current.onStateChange({
          tier,
          shown: points.length,
          total,
          loading: false,
        });
      } else {
        const [pins, total] = await Promise.all([
          queryPins(bounds, current.filters, pinLimit()),
          queryViewportTotal(bounds, current.filters),
        ]);
        if (requestId !== requestIdRef.current) return;

        pinsRef.current = pins;
        redrawPins();

        handlersRef.current.onStateChange({
          tier,
          shown: pins.length,
          total,
          loading: false,
        });
      }
      setError(null);
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      // Surfaced rather than swallowed: a silent failure here looks identical
      // to an area with no listings.
      setError(cause instanceof Error ? cause.message : String(cause));
      handlersRef.current.onStateChange({ tier, shown: 0, total: 0, loading: false });
    }
  }, [redrawPins]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refresh();
      // The colour scale follows the viewport, so it is re-fitted on the same
      // settled-pan signal the data query uses.
      rescaleOverlay();
    }, QUERY_DEBOUNCE_MS);
  }, [refresh, rescaleOverlay]);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      minZoom: 5,
      maxZoom: 18,
      maxBounds: SAUDI_MAX_BOUNDS,
      maxBoundsViscosity: 0.7,
      zoomControl: false,
      preferCanvas: true,
    });

    map.fitBounds(SAUDI_VIEW_BOUNDS);

    for (const layer of buildBaseLayers(BASEMAP)) layer.addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    mapRef.current = map;
    map.on("moveend", scheduleRefresh);
    map.on("zoomend", scheduleRefresh);

    // Placing the distance-search point. Ignored unless the filter panel asked
    // for it, so an ordinary click on the map still does nothing.
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!pickingRef.current) return;
      handlersRef.current.onPlaceNearPoint(event.latlng.lat, event.latlng.lng);
    });

    void refresh();

    return () => {
      map.off("moveend", scheduleRefresh);
      map.off("zoomend", scheduleRefresh);
      map.remove();
      mapRef.current = null;
    };
  }, [refresh, scheduleRefresh]);

  // Filters change which listings match, so they need a new query. Selection
  // deliberately does not appear here: it changes how one existing pin is
  // drawn, and re-running the viewport query for that meant two full DuckDB
  // scans on every click.
  //
  // Debounced through the same path a pan uses. The price and area fields are
  // free text: typing "2500000" is seven filter states, and running the
  // viewport query on each one meant seven full scans to answer a question the
  // user had not finished asking.
  useEffect(() => {
    if (mapRef.current) scheduleRefresh();
  }, [filters, locale, scheduleRefresh]);

  // Selection: redraw the pins already in hand, no query.
  useEffect(() => {
    if (mapRef.current && pinsRef.current.length > 0) redrawPins();
  }, [selectedListing, redrawPins]);

  // The price overlay depends on exactly two things: which property type is
  // selected and whether it is for sale or rent. Depending on the whole
  // `filters` object meant typing one digit into the price field re-ran the
  // district-price query and repainted every polygon.
  const overlayEstateType = filters.estateTypes[0] ?? null;
  const overlayPurpose = filters.purpose ?? "sell";

  useEffect(() => {
    let cancelled = false;

    async function draw(): Promise<void> {
      overlayLayerRef.current?.remove();
      overlayLayerRef.current = null;
      overlayShadesRef.current = new Map();

      // No type selected means no honest number to shade with: a district
      // median mixing land and villas maps the listing mix, not the price.
      if (overlay !== "price" || overlayEstateType === null) {
        handlersRef.current.onOverlayBreaks([]);
        return;
      }

      const [outlines, prices] = await Promise.all([
        loadOutlines(),
        queryDistrictPrices(overlayEstateType, overlayPurpose),
      ]);
      // Re-read the map after the await: the component can unmount while the
      // outlines are in flight.
      const liveMap = mapRef.current;
      if (cancelled || liveMap === null) return;

      if (prices.length === 0) {
        handlersRef.current.onOverlayBreaks([]);
        return;
      }

      const byKey = shadesByKey(
        prices.map((price) => ({
          city: price.city,
          district: price.district,
          value: price.median_price_per_m2,
        })),
      );
      overlayShadesRef.current = byKey;
      overlayCentresRef.current = districtCentres(outlines);
      nationalBreaksRef.current = quantileBreaks(
        prices.map((price) => price.median_price_per_m2),
      );

      const layer = buildChoroplethLayer(
        outlines,
        byKey,
        nationalBreaksRef.current,
        (value) => `${formatNumber(value)} ${stateRef.current.dictionary.units.sarPerSqm}`,
        (shade) => handlersRef.current.onSelectDistrict(shade.city, shade.district),
      );
      layer.addTo(liveMap);
      // Under the pins and heat, which are added later and therefore on top.
      layer.bringToBack();
      overlayLayerRef.current = layer;

      // Immediately re-fit to what is on screen. Building with the national
      // breaks first means the layer is never styled against nothing.
      rescaleOverlay();
    }

    void draw().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      cancelled = true;
    };
  }, [overlay, overlayEstateType, overlayPurpose, rescaleOverlay]);

  // Turning the price layer on or off changes whether the density surface is
  // drawn at all, so the listings are redrawn -- but only on that toggle, not
  // on every change to the type or purpose, which the filter effect covers.
  useEffect(() => {
    if (mapRef.current) void refresh();
  }, [overlay, refresh]);

  // The distance search: a circle for the area, a dot for the point itself.
  // Drawn separately from the services radius, which answers a different
  // question and can be on screen at the same time.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;

    nearLayerRef.current?.remove();
    nearLayerRef.current = null;
    if (near === null) return;

    const group = L.layerGroup([
      buildNearCircle(near.lat, near.lng, near.radiusKm * 1000),
      L.circleMarker([near.lat, near.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1d4ed8",
        fillOpacity: 1,
        interactive: false,
      }),
    ]);
    group.addTo(map);
    nearLayerRef.current = group;
  }, [near]);

  // A crosshair while picking, so the map reads as armed rather than inert.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    container.style.cursor = pickingPoint ? "crosshair" : "";
  }, [pickingPoint]);

  // The services radius circle is independent of the data layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (radiusLayerRef.current) {
      radiusLayerRef.current.remove();
      radiusLayerRef.current = null;
    }
    if (selectedListing && radiusMetres !== null) {
      const circle = buildRadiusCircle(
        selectedListing.lat,
        selectedListing.lng,
        radiusMetres,
      );
      circle.addTo(map);
      radiusLayerRef.current = circle;
    }
  }, [selectedListing, radiusMetres]);

  return (
    <div className="meimar-map-root">
      <div ref={containerRef} className="meimar-map" role="application" aria-label={dictionary.nav.map} />
      {error !== null && (
        <div className="meimar-map-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function swapDataLayer(
  map: L.Map,
  layerRef: { current: L.Layer | null },
  next: L.Layer,
): void {
  layerRef.current?.remove();
  next.addTo(map);
  layerRef.current = next;
}

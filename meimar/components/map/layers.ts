import L from "leaflet";
import "leaflet.heat";

import { formatPriceCompact } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { HeatPoint, PinListing } from "@/lib/duckdb/queries";

import { CHOROPLETH_NO_DATA, CHOROPLETH_STEPS, PALETTE } from "./palette";

/**
 * Leaflet layer construction.
 *
 * These are plain functions that build layers, not React components. Leaflet
 * owns its own DOM and mutates it imperatively; wrapping each layer in a
 * component would mean reconciling two systems that both want to control the
 * same nodes, for no benefit.
 */

/**
 * How many pins carry a visible price label.
 *
 * This caps the number of labels, it does not switch them off: an earlier rule
 * hid every label once the viewport held more than this many pins, which meant
 * prices disappeared exactly in the dense central districts where they are most
 * worth reading. Pins arrive ordered newest-first, so the labelled ones are the
 * most recently updated listings and the rest stay as dots.
 *
 * Higher than it used to be because labels no longer overlap: the ceiling that
 * actually binds is now the collision test below, and this is a backstop
 * against pathological cases rather than the thing doing the work.
 */
export const PRICE_LABEL_LIMIT = 400;

/**
 * Price labels appear as soon as there are pins to label.
 *
 * This deliberately equals `ZOOM_PIN_MIN`. It used to be one higher, which
 * produced a whole zoom level -- the first one a user reaches by zooming in --
 * showing individual listings as bare dots with no price on any of them. The
 * point of dropping to pins is to read prices.
 */
export const ZOOM_PRICE_LABEL_MIN = 14;

/**
 * Estimated on-screen width of a price pill, in pixels.
 *
 * Measured against the rendered labels: width tracks character count almost
 * exactly, at 5.15px per character over a 19.3px base of padding and border.
 * Rounded up slightly, because under-estimating produces the overlap this
 * exists to prevent while over-estimating only drops a label.
 *
 * A measured width would be exact, but every label would have to be in the DOM
 * to be measured -- which is the situation being avoided.
 */
function estimateLabelWidth(text: string): number {
  return text.length * 5.3 + 21;
}

/**
 * Vertical clearance between two pills. They render 24px tall.
 *
 * Labels never overlap vertically without also overlapping horizontally, so
 * this is the cheap half of the test.
 */
const LABEL_HEIGHT = 26;

/** Horizontal breathing room beyond the two half-widths, so pills do not kiss. */
const LABEL_GAP = 6;

/**
 * Bucket width for the overlap grid.
 *
 * Half the widest realistic pill, so a candidate can only conflict with a
 * label within two cells either side. Comparing against every label placed so
 * far would be quadratic and shows by a few hundred pins.
 */
const LABEL_BUCKET = 48;
const LABEL_BUCKET_REACH = 2;

type PlacedLabel = { x: number; y: number; halfWidth: number };
type LabelGrid = Map<string, PlacedLabel[]>;

/**
 * Reserve screen space for a label, or report that it is taken.
 *
 * Pills are centred on their anchor (`translateX(-50%)`), so the test is
 * between half-widths rather than against a fixed gap: "10.6 مليون" is 78px
 * wide and "450 ألف" is 45px, and one fixed number cannot serve both.
 */
function claimLabelSlot(grid: LabelGrid, point: L.Point, text: string): boolean {
  const halfWidth = estimateLabelWidth(text) / 2;
  const column = Math.floor(point.x / LABEL_BUCKET);
  const row = Math.floor(point.y / LABEL_HEIGHT);

  for (let dx = -LABEL_BUCKET_REACH; dx <= LABEL_BUCKET_REACH; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const occupants = grid.get(`${column + dx}:${row + dy}`);
      if (occupants === undefined) continue;
      for (const placed of occupants) {
        if (
          Math.abs(placed.x - point.x) < placed.halfWidth + halfWidth + LABEL_GAP &&
          Math.abs(placed.y - point.y) < LABEL_HEIGHT
        ) {
          return false;
        }
      }
    }
  }

  const key = `${column}:${row}`;
  const placed: PlacedLabel = { x: point.x, y: point.y, halfWidth };
  const cell = grid.get(key);
  if (cell === undefined) grid.set(key, [placed]);
  else cell.push(placed);
  return true;
}

/**
 * Density surface for every zoom below the pin tier.
 *
 * Points are **real listing coordinates**, uniformly sampled by DuckDB, not
 * aggregated cell centroids. An earlier version fed one weighted point per H3
 * cell, and that is precisely what made the map read as bubbles: an r7 cell is
 * ~1.2 km across, tens of pixels at mid zoom, so every cell drew its own circle
 * and the surface broke into a grid of dots. Uniform sampling preserves
 * relative density, so the picture stays faithful with no grid to see.
 *
 * Every point therefore carries equal weight -- density is expressed by how
 * many points land together, which is what a heat layer already does well.
 */
export function buildHeatLayer(points: readonly HeatPoint[], zoom: number): L.Layer {
  // Weight 1 each: every point is one listing, and density is expressed by how
  // many of them fall in the same place. `max` below decides how many
  // overlapping listings count as fully saturated.
  const coordinates: [number, number, number][] = points.map((point) => [
    point.lat,
    point.lng,
    1,
  ]);

  // Radius has to shrink as zoom grows. Sampled points spread apart on screen
  // as the viewport tightens, so a fixed radius that looks right over the whole
  // country turns into loose confetti over one city.
  const isCountryScale = zoom <= 8;

  return L.heatLayer(coordinates, {
    // Blur deliberately exceeds radius. A lone listing in open desert is a real
    // data point, not an artifact, but drawn as a hard disc it reads as a
    // rendering blob; the extra blur turns it into a soft gradient so isolated
    // points look like faint density instead of a marker.
    radius: isCountryScale ? 12 : 18,
    blur: isCountryScale ? 24 : 26,
    // How many overlapping listings count as fully saturated. Kept low because
    // a uniform sample spread over a whole country leaves most pixels holding
    // one or two points; a high ceiling makes everything outside central Riyadh
    // render as effectively nothing.
    max: isCountryScale ? 3 : 10,
    minOpacity: 0.45,
    // Cool-to-hot, deliberately NOT the brand palette.
    //
    // The warm sand ramp used elsewhere is close to invisible here: Saudi
    // aerial imagery is itself warm sand, so a brand-coloured overlay sits on
    // top of its own colour and disappears. An overlay's first job is to be
    // distinguishable from the ground under it. This ramp starts cool — the
    // complement of desert tan, so low density still reads — and ends hot and
    // bright where listings concentrate. Brand identity stays in the chrome:
    // header, panel, pins and the services bar.
    //
    // Encodes listing density only, never price, which the brief keeps off the
    // map's colour channel.
    gradient: {
      0.0: "rgba(59, 15, 112, 0)",
      0.25: "#5b2c8f",
      0.5: "#b63679",
      0.75: "#f2704b",
      1.0: "#ffe98a",
    },
  });
}

export function buildPinLayer(
  pins: readonly PinListing[],
  zoom: number,
  locale: Locale,
  dictionary: Dictionary,
  selectedId: number | null,
  onSelect: (listing: PinListing) => void,
): L.LayerGroup {
  const group = L.layerGroup();

  // A shared canvas renderer keeps hundreds of dots to one DOM element.
  const renderer = L.canvas({ padding: 0.3 });

  const labelsAllowed = zoom >= ZOOM_PRICE_LABEL_MIN;
  let labelsDrawn = 0;

  // Absolute pixel coordinates at this zoom. `L.CRS` projects without a map
  // instance, and only distances between labels matter here, so the arbitrary
  // origin is irrelevant.
  const grid: LabelGrid = new Map();

  for (const pin of pins) {
    const isSelected = pin.id === selectedId;
    const priceText = formatPriceCompact(pin.price, locale, dictionary);
    // The selected pin keeps its price even when a neighbour already holds
    // that slot: overlapping one label is the right trade against the listing
    // the user just clicked being the only one on screen without a number.
    // It also draws last-but-largest, so it reads on top of whatever it meets.
    const projected = L.CRS.EPSG3857.latLngToPoint(L.latLng(pin.lat, pin.lng), zoom);
    const showLabel =
      labelsAllowed &&
      labelsDrawn < PRICE_LABEL_LIMIT &&
      (claimLabelSlot(grid, projected, priceText) || isSelected);

    const dot = L.circleMarker([pin.lat, pin.lng], {
      renderer,
      radius: isSelected ? 9 : 6,
      // One unified colour for every pin. Price is shown as a label, never
      // encoded as colour -- the brief is explicit that there is no
      // predictive or price-derived colouring on the map.
      color: PALETTE.pinRing,
      weight: isSelected ? 2.5 : 1.5,
      fillColor: isSelected ? PALETTE.pinSelected : PALETTE.pinFill,
      fillOpacity: 1,
    });
    dot.on("click", () => onSelect(pin));
    group.addLayer(dot);

    if (showLabel) {
      labelsDrawn += 1;
      const label = L.marker([pin.lat, pin.lng], {
        interactive: true,
        keyboard: false,
        icon: L.divIcon({
          className: "meimar-price-label-wrapper",
          html: `<span class="meimar-price-label${isSelected ? " is-selected" : ""}">${priceText}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 18],
        }),
      });
      label.on("click", () => onSelect(pin));
      group.addLayer(label);
    }
  }

  return group;
}

export type DistrictShade = {
  city: string;
  district: string;
  value: number;
};

/**
 * Quantile breaks over the values present, ascending.
 *
 * Quantiles of what is actually on screen rather than fixed price bands:
 * SAR/m² spans an order of magnitude between a village and central Riyadh, and
 * any fixed scale flattens one end of the country into a single colour.
 */
export function quantileBreaks(values: readonly number[]): number[] {
  // No values means no scale. Returning breaks built from `undefined` would
  // render a legend of blanks over a map shaded by NaN comparisons.
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const count = CHOROPLETH_STEPS.length;
  return Array.from({ length: count - 1 }, (_, index) => {
    const position = ((index + 1) / count) * (sorted.length - 1);
    return sorted[Math.round(position)];
  });
}

/**
 * Approximate centre of each district outline, for deciding what is on screen.
 *
 * The mean of a polygon's ring, not a true area centroid: this only has to
 * answer "is this district roughly in view", and these outlines are hulls over
 * listing positions rather than precise geometry to begin with.
 */
export function districtCentres(
  outlines: GeoJSON.FeatureCollection,
): Map<string, L.LatLng> {
  const centres = new Map<string, L.LatLng>();

  for (const feature of outlines.features) {
    const { geometry, properties } = feature;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") continue;

    const rings =
      geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
    const ring = rings[0];
    if (ring === undefined || ring.length === 0) continue;

    let sumLng = 0;
    let sumLat = 0;
    for (const [lng, lat] of ring) {
      sumLng += lng;
      sumLat += lat;
    }
    centres.set(
      shadeKey(properties?.city, properties?.district),
      L.latLng(sumLat / ring.length, sumLng / ring.length),
    );
  }

  return centres;
}

function shadeFor(value: number, breaks: readonly number[]): string {
  const step = breaks.findIndex((limit) => value <= limit);
  return CHOROPLETH_STEPS[step === -1 ? CHOROPLETH_STEPS.length - 1 : step];
}

/** Keys a district by both parts of its identity: names alone are not unique. */
export function shadeKey(city: string, district: string): string {
  return `${city}|${district}`;
}

export function shadesByKey(
  shades: readonly DistrictShade[],
): Map<string, DistrictShade> {
  return new Map(shades.map((shade) => [shadeKey(shade.city, shade.district), shade]));
}

function styleFor(
  shade: DistrictShade | undefined,
  breaks: readonly number[],
): L.PathOptions {
  // Absent figure, present district. Dashed and unfilled so it cannot be
  // mistaken for the cheapest step -- "nothing of this type is advertised
  // here" and "this is where the cheap ones are" must not look alike.
  if (shade === undefined || breaks.length === 0) {
    return {
      color: CHOROPLETH_NO_DATA,
      weight: 1,
      opacity: 0.55,
      dashArray: "3 4",
      fillOpacity: 0,
    };
  }

  return {
    color: PALETTE.pinRing,
    // Heavier and more opaque than the outlines used to be. The two lightest
    // steps are near-white, and over bright aerial sand a 0.6px stroke at half
    // opacity left them with no readable edge at all.
    weight: 1.1,
    opacity: 0.8,
    dashArray: undefined,
    fillColor: shadeFor(shade.value, breaks),
    fillOpacity: 0.75,
  };
}

/**
 * Shade district outlines by price per square metre.
 *
 * Outlines are traced from each district's own listings, so they follow where
 * property actually is rather than a municipal boundary.
 *
 * Breaks are passed in rather than derived here, because the layer is built
 * once and restyled as the viewport moves: quantiles of the whole country
 * flatten any single city into one or two colours, which is the difference
 * between a layer that informs and a layer that decorates. See
 * `applyChoroplethBreaks`.
 */
export function buildChoroplethLayer(
  outlines: GeoJSON.FeatureCollection,
  byKey: ReadonlyMap<string, DistrictShade>,
  breaks: readonly number[],
  formatValue: (value: number) => string,
  onSelect: (shade: DistrictShade) => void,
): L.GeoJSON {
  return L.geoJSON(outlines, {
    style: (feature) =>
      styleFor(
        byKey.get(shadeKey(feature?.properties?.city, feature?.properties?.district)),
        breaks,
      ),
    onEachFeature: (feature, layer) => {
      const shade = byKey.get(
        shadeKey(feature.properties?.city, feature.properties?.district),
      );
      if (shade === undefined) return;
      // `sticky` keeps the value beside the cursor while the pointer crosses a
      // large polygon, rather than pinning it to a centroid that may be off
      // screen. Touch has no hover, so the click below is the equivalent.
      layer.bindTooltip(
        `<strong>${escapeHtml(shade.district)}</strong><br>${escapeHtml(formatValue(shade.value))}`,
        { direction: "top", className: "meimar-tooltip", sticky: true },
      );
      layer.on("click", () => onSelect(shade));
    },
  });
}

/**
 * Restyle an existing choropleth against new breaks.
 *
 * Restyling rather than rebuilding: the 1,342 outlines are already parsed into
 * Leaflet paths, and re-running `L.geoJSON` on every pan would re-parse all of
 * them to change five fill colours.
 */
export function applyChoroplethBreaks(
  layer: L.GeoJSON,
  byKey: ReadonlyMap<string, DistrictShade>,
  breaks: readonly number[],
): void {
  layer.setStyle((feature) =>
    styleFor(
      byKey.get(shadeKey(feature?.properties?.city, feature?.properties?.district)),
      breaks,
    ),
  );
}

/**
 * District names come from listing data and are injected into tooltip HTML,
 * which Leaflet takes as a string. Escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The distance-search area.
 *
 * Deliberately a different colour from the services radius, which is magenta:
 * both can be on screen at once and they answer different questions -- "what is
 * near this listing" against "which listings are near this point". A solid
 * stroke rather than the services circle's dashes, because this one is a filter
 * that is actually excluding results, not an annotation.
 */
export function buildNearCircle(lat: number, lng: number, radiusM: number): L.Circle {
  return L.circle([lat, lng], {
    radius: radiusM,
    color: "#1d4ed8",
    weight: 2,
    fillColor: "#1d4ed8",
    fillOpacity: 0.07,
    interactive: false,
  });
}

export function buildRadiusCircle(lat: number, lng: number, radiusM: number): L.Circle {
  return L.circle([lat, lng], {
    radius: radiusM,
    // Bright enough to read over imagery; the fill stays barely-there so it
    // shades the area without hiding what is on the ground.
    color: PALETTE.pinFill,
    weight: 2,
    dashArray: "5 5",
    fillColor: PALETTE.pinFill,
    fillOpacity: 0.1,
    interactive: false,
  });
}

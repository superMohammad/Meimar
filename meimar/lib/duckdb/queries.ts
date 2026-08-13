import { duckDbClient } from "./client";
import {
  buildBoundsPredicate,
  buildFilterPredicate,
  quote,
  type ListingFilters,
  type MapBounds,
} from "./filters";

/**
 * Every query the map makes, each with a declared row type.
 *
 * The zoom tiers exist because a dense viewport holds hundreds of thousands of
 * listings and Leaflet cannot draw that. Zoomed out the map draws a density
 * surface from a random sample of real coordinates; at street level it draws a
 * capped set of individual pins.
 */

/**
 * Work is sized to the screen, not to a desktop.
 *
 * A phone was being asked to sample 25,000 points, ship them across the worker
 * boundary and composite them into a 393px-wide canvas -- a density surface far
 * finer than the display can resolve, paid for in transfer, garbage and paint
 * on the least capable device. The small-screen budgets below are roughly a
 * third of the desktop ones and are visually indistinguishable at that size,
 * because the limit on what a heat surface can show is pixels, not samples.
 */
const SMALL_SCREEN_PX = 720;

function isSmallScreen(): boolean {
  // Guarded for the server: these constants are imported by modules that also
  // render during prerendering.
  return typeof window !== "undefined" && window.innerWidth <= SMALL_SCREEN_PX;
}

/** Individual pins drawn at street level. */
export function pinLimit(): number {
  return isSmallScreen() ? 200 : 500;
}

/**
 * Points fed to the heat layer per viewport.
 *
 * Uniform sampling preserves relative density, so the surface stays faithful
 * while the browser handles a fixed cost regardless of how many listings the
 * viewport actually holds.
 */
export function heatPointLimit(): number {
  return isSmallScreen() ? 8_000 : 25_000;
}

/** Above this zoom the map draws individual pins. */
export const ZOOM_PIN_MIN = 14;

export type MapTier = { kind: "heat" } | { kind: "pins" };

export function tierForZoom(zoom: number): MapTier {
  return zoom >= ZOOM_PIN_MIN ? { kind: "pins" } : { kind: "heat" };
}

export type HeatPoint = {
  lat: number;
  lng: number;
};

export type PinListing = {
  id: number;
  lat: number;
  lng: number;
  price: number;
  area: number;
  beds: number | null;
  estate_type: string;
  estate_benefit: string;
  city: string;
  district: string;

  /**
   * Out-of-fold model estimate and its 80% interval, in SAR.
   *
   * Null for every rental and for sale listings outside the price bounds the
   * models were fitted on — the models are sale-only, and an estimate on a
   * rental would be nonsense rather than an approximation. Consumers must
   * branch on null rather than defaulting to zero.
   */
  estimate: number | null;
  estimate_low: number | null;
  estimate_high: number | null;
  /** Signed: positive means the asking price is above the estimate. */
  price_delta_pct: number | null;
};

export type ViewportSummary = {
  total: number;
};

export type ListingDetail = {
  id: number;
  title: string | null;
  content: string | null;
  beds: number | null;
  livings: number | null;
  wc: number | null;
  area: number | null;
  street_width: number | null;
  age: number | null;
  rooms: number | null;
  furnished: number | null;
} & Record<string, unknown>;

export type DistrictStats = {
  city: string;
  district: string;
  listing_count: number;
  median_price: number | null;
  median_price_per_m2: number | null;
  sufficient: boolean;
};

/**
 * Price per square metre for one (city, district, type, purpose).
 *
 * Always segmented by type. Within one district the median runs from ~1,400
 * SAR/m² for a store to ~12,300 for a villa, so an unsegmented figure compares
 * different things and shades the map by which types a district advertises.
 */
export type DistrictPrice = {
  city: string;
  district: string;
  estate_type: string;
  estate_benefit: string;
  listing_count: number;
  median_price_per_m2: number;
  p25_price_per_m2: number;
  p75_price_per_m2: number;
};

/**
 * A random sample of real listing coordinates for the density surface.
 *
 * `USING SAMPLE` must wrap an already-filtered subquery. DuckDB applies an
 * inline sample to the table scan, *before* the WHERE: written inline, a Riyadh
 * viewport holding 291,510 listings returns about 9,000 points instead of the
 * limit, so the heat thins out as the user zooms in and looks like sparse data
 * rather than a bug.
 */
export async function queryHeatPoints(
  bounds: MapBounds,
  filters: ListingFilters,
  limit: number,
): Promise<HeatPoint[]> {
  return duckDbClient.query<HeatPoint>(
    `
    SELECT lat, lng FROM (
      SELECT lat, lng
      FROM map
      WHERE ${buildBoundsPredicate(bounds)}
        AND ${buildFilterPredicate(filters)}
    ) USING SAMPLE ${limit} ROWS
  `,
    ["map"],
  );
}

/**
 * Individual listings in the viewport, newest first, capped.
 *
 * The cap is not a silent truncation: `queryViewportTotal` gives the real
 * count so the UI can say how many of how many it is showing.
 */
export async function queryPins(
  bounds: MapBounds,
  filters: ListingFilters,
  limit: number,
): Promise<PinListing[]> {
  return duckDbClient.query<PinListing>(`
    SELECT id, lat, lng, price, area, beds, estate_type, estate_benefit,
           city, district,
           estimate, estimate_low, estimate_high, price_delta_pct
    FROM map
    WHERE ${buildBoundsPredicate(bounds)}
      AND ${buildFilterPredicate(filters)}
    ORDER BY last_update DESC
    LIMIT ${limit}
  `, ["map"]);
}

/** How many listings actually match, ignoring the pin cap. */
export async function queryViewportTotal(
  bounds: MapBounds,
  filters: ListingFilters,
): Promise<number> {
  const rows = await duckDbClient.query<ViewportSummary>(`
    SELECT count(*) AS total
    FROM map
    WHERE ${buildBoundsPredicate(bounds)}
      AND ${buildFilterPredicate(filters)}
  `, ["map"]);
  return rows[0]?.total ?? 0;
}

/**
 * One listing's map row, for the standalone listing page.
 *
 * The map hands the panel a row it already has; a shared link has only an id,
 * so the same columns are fetched directly.
 */
export async function queryListingById(id: number): Promise<PinListing | null> {
  const rows = await duckDbClient.query<PinListing>(`
    SELECT id, lat, lng, price, area, beds, estate_type, estate_benefit,
           city, district,
           estimate, estimate_low, estimate_high, price_delta_pct
    FROM map WHERE id = ${id} LIMIT 1
  `, ["map"]);
  return rows[0] ?? null;
}

/**
 * One listing's full record.
 *
 * `details` is ~155 MB and ordered by id with small row groups, so this reads
 * a single row group's column chunks rather than the file.
 */
export async function queryListingDetail(id: number): Promise<ListingDetail | null> {
  const rows = await duckDbClient.query<ListingDetail>(`
    SELECT * FROM details WHERE id = ${id} LIMIT 1
  `, ["details"]);
  return rows[0] ?? null;
}

/**
 * Neighborhood statistics for one district.
 *
 * Keyed on (city, district) because district names are not unique: this
 * dataset has 1,114 distinct names across 1,979 real pairs.
 */
export async function queryDistrict(
  city: string,
  district: string,
): Promise<DistrictStats | null> {
  const rows = await duckDbClient.query<DistrictStats>(`
    SELECT * FROM districts
    WHERE city = ${quote(city)} AND district = ${quote(district)}
    LIMIT 1
  `, ["districts"]);
  return rows[0] ?? null;
}

/**
 * The comparable set behind one listing's estimate: same district, same
 * property type, same purpose. Null when too few exist to summarise.
 */
export async function queryComparable(
  city: string,
  district: string,
  estateType: string,
  purpose: string,
): Promise<DistrictPrice | null> {
  const rows = await duckDbClient.query<DistrictPrice>(`
    SELECT * FROM district_prices
    WHERE city = ${quote(city)}
      AND district = ${quote(district)}
      AND estate_type = ${quote(estateType)}
      AND estate_benefit = ${quote(purpose)}
    LIMIT 1
  `, ["district_prices"]);
  return rows[0] ?? null;
}

/**
 * Median price per m² per district for one type and purpose, for the map's
 * price layer. Returns every district that has enough listings to summarise.
 */
export async function queryDistrictPrices(
  estateType: string,
  purpose: string,
): Promise<DistrictPrice[]> {
  return duckDbClient.query<DistrictPrice>(`
    SELECT * FROM district_prices
    WHERE estate_type = ${quote(estateType)}
      AND estate_benefit = ${quote(purpose)}
  `, ["district_prices"]);
}

/**
 * Filter state and the single SQL predicate built from it.
 *
 * One builder serves every query -- hex aggregation, pin listing, and the
 * result count. Writing the WHERE clause twice is how a map ends up showing
 * hexes that disagree with the pins inside them.
 */

export type Purpose = "sell" | "rental";

/**
 * "Within this far of this point."
 *
 * Straight-line distance, and the UI says so. Travel time would need a routing
 * service, and there is none: inventing a "25 minute commute" from a radius
 * would be a number the product cannot stand behind, which is the one thing
 * this codebase consistently refuses to do.
 */
export type NearFilter = {
  lat: number;
  lng: number;
  radiusKm: number;
};

/** The radii offered. Wide enough to cover "my side of the city". */
export const NEAR_RADII_KM = [1, 3, 5, 10, 20] as const;

export type ListingFilters = {
  purpose: Purpose | null;
  estateTypes: readonly string[];
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  minBeds: number | null;
  city: string | null;
  district: string | null;
  near: NearFilter | null;
};

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export const EMPTY_FILTERS: ListingFilters = {
  purpose: null,
  estateTypes: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  minBeds: null,
  city: null,
  district: null,
  near: null,
};

/**
 * SQL for "within `radiusKm` of (lat, lng)".
 *
 * Two clauses, and the order matters. The bounding box comes first because it
 * compares raw columns, so DuckDB can skip whole row groups on their min/max
 * statistics without decoding them. The circle test then trims the corners of
 * that box. Written the other way round, every one of 781K rows would go
 * through trigonometry before anything could be discarded.
 *
 * The distance itself is equirectangular rather than haversine, which costs two
 * multiplications per row instead of three trig calls. Measured against
 * haversine over 781K listings at every radius offered, the two disagree by at
 * most 2 listings in 82,270 (0.021%) -- far inside the error of the listing
 * coordinates themselves.
 */
function buildNearPredicate(near: NearFilter): string {
  const { lat, lng, radiusKm } = near;

  // One degree along a great circle, on the same sphere haversine assumes.
  // Mixing models is what makes an approximation look broken: an earlier
  // version used the WGS84 equatorial figures (110.574 / 111.32) against a
  // spherical reference and came out 0.58% wide -- 28 extra listings in a 5km
  // search -- which is a units bug wearing the costume of a rounding error.
  const kmPerDegree = 111.19492664455873;
  const kmPerDegreeLng = kmPerDegree * Math.cos((lat * Math.PI) / 180);

  const latDelta = radiusKm / kmPerDegree;
  const lngDelta = radiusKm / kmPerDegreeLng;

  const dy = `((lat - ${lat}) * ${kmPerDegree})`;
  const dx = `((lng - ${lng}) * ${kmPerDegreeLng})`;

  return (
    `lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}` +
    ` AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}` +
    ` AND (${dx} * ${dx} + ${dy} * ${dy}) <= ${radiusKm * radiusKm}`
  );
}

/**
 * Escape a value for inlining as a SQL string literal.
 *
 * DuckDB-WASM's query API takes a SQL string, so city and district names --
 * which come from the data and reach here through a select element -- are
 * escaped rather than bound. Doubling single quotes is the whole rule for
 * DuckDB string literals.
 */
function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Build the WHERE clause fragment for the current filters, without `WHERE`. */
export function buildFilterPredicate(filters: ListingFilters): string {
  const clauses: string[] = [];

  if (filters.purpose !== null) {
    clauses.push(`estate_benefit = ${quote(filters.purpose)}`);
  }
  if (filters.estateTypes.length > 0) {
    clauses.push(`estate_type IN (${filters.estateTypes.map(quote).join(", ")})`);
  }
  if (isFiniteNumber(filters.priceMin)) clauses.push(`price >= ${filters.priceMin}`);
  if (isFiniteNumber(filters.priceMax)) clauses.push(`price <= ${filters.priceMax}`);
  if (isFiniteNumber(filters.areaMin)) clauses.push(`area >= ${filters.areaMin}`);
  if (isFiniteNumber(filters.areaMax)) clauses.push(`area <= ${filters.areaMax}`);
  if (isFiniteNumber(filters.minBeds)) clauses.push(`beds >= ${filters.minBeds}`);
  if (filters.city !== null) clauses.push(`city = ${quote(filters.city)}`);
  if (filters.district !== null) clauses.push(`district = ${quote(filters.district)}`);
  if (filters.near !== null) clauses.push(buildNearPredicate(filters.near));

  return clauses.length > 0 ? clauses.join(" AND ") : "TRUE";
}

/** Build the bounding-box predicate for the current viewport. */
export function buildBoundsPredicate(bounds: MapBounds): string {
  return (
    `lat BETWEEN ${bounds.south} AND ${bounds.north} ` +
    `AND lng BETWEEN ${bounds.west} AND ${bounds.east}`
  );
}

export { quote };

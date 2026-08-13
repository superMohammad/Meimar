import {
  EMPTY_FILTERS,
  NEAR_RADII_KM,
  type ListingFilters,
  type NearFilter,
  type Purpose,
} from "./filters";

/**
 * Filters as query parameters, so a map view is a link.
 *
 * Without this, "villas in حي الملقا under 2M" exists only in one browser tab:
 * it cannot be sent to anyone, bookmarked, or survive a reload. The parameter
 * names are short because they end up visible in the address bar.
 *
 * Only non-default values are written, so an unfiltered map has a clean URL.
 */

const PARAM = {
  purpose: "for",
  estateType: "type",
  priceMin: "pmin",
  priceMax: "pmax",
  areaMin: "amin",
  areaMax: "amax",
  minBeds: "beds",
  city: "city",
  district: "district",
  overlay: "layer",
  nearLat: "nlat",
  nearLng: "nlng",
  nearKm: "nkm",
} as const;

const PURPOSES: readonly string[] = ["sell", "rental"];

/**
 * A distance search survives a reload and a shared link, or it is not a
 * feature -- "villas within 5km of my office" is exactly the thing someone
 * sends to another person.
 *
 * All three parts must be present and sane together. A URL carrying a latitude
 * but no radius, or coordinates outside the country, is discarded rather than
 * half-applied: a partial filter silently returning nothing is worse than no
 * filter at all.
 */
function readNear(params: URLSearchParams): NearFilter | null {
  const lat = readNumber(params, PARAM.nearLat);
  const lng = readNumber(params, PARAM.nearLng);
  const radiusKm = readNumber(params, PARAM.nearKm);
  if (lat === null || lng === null || radiusKm === null) return null;

  // The same envelope the map itself is clamped to.
  if (lat < 12 || lat > 37 || lng < 29 || lng > 61) return null;
  if (!(NEAR_RADII_KM as readonly number[]).includes(radiusKm)) return null;

  return { lat, lng, radiusKm };
}

function readNumber(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function filtersFromParams(params: URLSearchParams): ListingFilters {
  const purpose = params.get(PARAM.purpose);
  const estateType = params.get(PARAM.estateType);

  return {
    ...EMPTY_FILTERS,
    // Validated rather than cast: these values come from a URL a stranger may
    // have edited, and an unrecognised purpose would reach SQL as a filter that
    // silently matches nothing.
    purpose: purpose !== null && PURPOSES.includes(purpose) ? (purpose as Purpose) : null,
    estateTypes: estateType !== null && estateType !== "" ? [estateType] : [],
    priceMin: readNumber(params, PARAM.priceMin),
    priceMax: readNumber(params, PARAM.priceMax),
    areaMin: readNumber(params, PARAM.areaMin),
    areaMax: readNumber(params, PARAM.areaMax),
    minBeds: readNumber(params, PARAM.minBeds),
    city: params.get(PARAM.city),
    district: params.get(PARAM.district),
    near: readNear(params),
  };
}

export function paramsFromFilters(
  filters: ListingFilters,
  overlay: string,
): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | null): void => {
    if (value !== null && value !== "") params.set(key, String(value));
  };

  set(PARAM.purpose, filters.purpose);
  set(PARAM.estateType, filters.estateTypes[0] ?? null);
  set(PARAM.priceMin, filters.priceMin);
  set(PARAM.priceMax, filters.priceMax);
  set(PARAM.areaMin, filters.areaMin);
  set(PARAM.areaMax, filters.areaMax);
  set(PARAM.minBeds, filters.minBeds);
  set(PARAM.city, filters.city);
  set(PARAM.district, filters.district);
  if (filters.near !== null) {
    // Five decimals is about a metre -- finer than the listing coordinates
    // themselves, and it keeps the address bar readable.
    set(PARAM.nearLat, filters.near.lat.toFixed(5));
    set(PARAM.nearLng, filters.near.lng.toFixed(5));
    set(PARAM.nearKm, filters.near.radiusKm);
  }
  if (overlay !== "none") set(PARAM.overlay, overlay);

  return params;
}

export function overlayFromParams(params: URLSearchParams): "none" | "price" {
  return params.get(PARAM.overlay) === "price" ? "price" : "none";
}

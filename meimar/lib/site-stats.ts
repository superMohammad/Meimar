/**
 * District types and slug helpers.
 *
 * Free of any Node import so client components can use them; the filesystem
 * loaders live in `site-stats.server.ts`. Keeping them apart is not a style
 * choice — importing `node:fs` into a client component fails the build with a
 * Turbopack panic rather than a useful error.
 */

export type SiteStats = {
  listings: number;
  with_estimate: number;
  cities: number;
  districts: number;
};

export type DistrictRow = {
  city: string;
  district: string;
  listing_count: number;
  median_price: number | null;
  median_price_per_m2: number | null;
  sufficient: boolean;
};

/** URL-safe slug for a city or district name. */
export function districtSlug(value: string): string {
  return encodeURIComponent(value.replace(/\s+/g, "-"));
}

export function districtFromSlug(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ");
}

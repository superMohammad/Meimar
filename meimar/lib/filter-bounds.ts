import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The option lists and slider ceilings the filter bar needs.
 *
 * Read on the server at render time from `public/data/filter-bounds.json`,
 * which `scripts/build_map_data.py` emits. The filter bar has to be usable
 * before DuckDB-WASM has finished booting, so these cannot come from a query.
 */

export type CityDistricts = {
  city: string;
  districts: string[];
};

export type FilterBounds = {
  estate_types: string[];
  purposes: string[];
  cities: CityDistricts[];
  /**
   * 99.5th percentile, not the maximum. Raw prices reach 100,000,050,000 SAR --
   * placeholder values that would make a slider bound to max(price) useless.
   */
  price_max: number;
  area_max: number;
};

export async function loadFilterBounds(): Promise<FilterBounds> {
  const path = join(process.cwd(), "public", "data", "filter-bounds.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as FilterBounds;
}

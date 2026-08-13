import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DistrictRow, SiteStats } from "./site-stats";

/**
 * Figures and district lists for the content pages, read from what the data
 * build produced.
 *
 * Nothing here is written by hand. A coverage number typed into a template goes
 * stale the first time the data is rebuilt and nobody notices, so the pages
 * derive their claims from `scripts/build_map_data.py` output instead.
 *
 * Both files are small — a few hundred KB — and are parsed once per process.
 */

async function readJson<T>(name: string): Promise<T> {
  const path = join(process.cwd(), "public", "data", name);
  return JSON.parse(await readFile(path, "utf8")) as T;
}

let cachedStats: SiteStats | null = null;
let cachedDistricts: DistrictRow[] | null = null;

export async function loadSiteStats(): Promise<SiteStats> {
  cachedStats ??= await readJson<SiteStats>("site-stats.json");
  return cachedStats;
}

/**
 * Districts with enough listings to summarise, busiest first.
 *
 * Only `sufficient` rows are emitted by the build, so a district page never
 * exists for a neighborhood whose median rests on three listings.
 */
export async function loadDistricts(): Promise<DistrictRow[]> {
  cachedDistricts ??= await readJson<DistrictRow[]>("districts.json");
  return cachedDistricts;
}

export type { DistrictRow, SiteStats };

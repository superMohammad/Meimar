/**
 * Model accuracy types and the market lookup.
 *
 * Deliberately free of any Node import so client components can use it. The
 * filesystem loader lives in `model-metrics.server.ts`: pulling `node:fs` into
 * this module put it in the browser bundle through `ListingPanel`, which fails
 * the build outright rather than degrading.
 */

export type MarketName = "built" | "land";

export type ModelMetrics = {
  /** Out-of-fold median absolute percentage error. */
  medianErrorPct: number;
  withinTenPct: number;
};

export type ModelMetricsByMarket = Record<MarketName, ModelMetrics>;

/** Which model priced a listing of this type. */
export function marketOf(estateType: string): MarketName {
  return estateType === "land" ? "land" : "built";
}

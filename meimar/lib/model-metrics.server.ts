import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { MarketName, ModelMetrics, ModelMetricsByMarket } from "./model-metrics";

/**
 * Reads the measured accuracy of the two valuation models from the artifacts
 * `scripts/train_models.py` writes.
 *
 * Read rather than hardcoded so the number the UI shows is always the number
 * the last training run measured. A stale hardcoded accuracy is worse than
 * none: it is a claim about the model that quietly stops being true.
 *
 * `server-only` makes the boundary enforced rather than merely intended -- an
 * accidental import from a client component fails at build time with a clear
 * message instead of a Turbopack panic about `node:fs`.
 */

type MetaFile = {
  metrics: { "MedAPE%": number; "within_10%": number };
};

async function readMarket(market: MarketName): Promise<ModelMetrics> {
  const path = join(process.cwd(), "models", `${market}_meta.json`);
  const meta = JSON.parse(await readFile(path, "utf8")) as MetaFile;
  return {
    medianErrorPct: meta.metrics["MedAPE%"],
    withinTenPct: meta.metrics["within_10%"],
  };
}

export async function loadModelMetrics(): Promise<ModelMetricsByMarket> {
  const [built, land] = await Promise.all([readMarket("built"), readMarket("land")]);
  return { built, land };
}

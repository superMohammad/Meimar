import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MapExplorer } from "@/components/MapExplorer";
import { loadFilterBounds } from "@/lib/filter-bounds";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadModelMetrics } from "@/lib/model-metrics.server";

export default async function MapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  // Read on the server so the filter bar is populated on first paint, before
  // DuckDB-WASM has booted in the browser. Model accuracy comes from the same
  // place for the same reason -- and because it must reflect the last training
  // run, not a number copied into the source.
  const [bounds, metrics] = await Promise.all([loadFilterBounds(), loadModelMetrics()]);

  return (
    // MapExplorer reads the query string to restore a shared view, which makes
    // it a dynamic client boundary; without this the whole page would opt out
    // of static rendering.
    <Suspense fallback={<div className="meimar-boot">{dictionary.map.loading}</div>}>
      <MapExplorer
        locale={locale}
        dictionary={dictionary}
        bounds={bounds}
        metrics={metrics}
      />
    </Suspense>
  );
}

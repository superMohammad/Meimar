import { notFound } from "next/navigation";

import { EstimateForm } from "@/components/EstimateForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadFilterBounds } from "@/lib/filter-bounds";
import { getDictionary, interpolate } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadModelMetrics } from "@/lib/model-metrics.server";

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const [bounds, metrics] = await Promise.all([loadFilterBounds(), loadModelMetrics()]);

  return (
    <>
      {/* This page had neither header nor footer -- the only one in the site
          without them. It carried a lone "معمار" back-link standing in for a
          header, which meant no navigation off the page and no footer
          disclaimer, on the one screen that produces a price estimate. */}
      <SiteHeader locale={locale} dictionary={dictionary} />

      <main id="main" tabIndex={-1} className="meimar-page">
      <header className="meimar-page-header">
        <h1>{dictionary.estimate.title}</h1>
        <p>{dictionary.estimate.subtitle}</p>
        {/* Accuracy is stated up front, not buried under the result: the user
            should know how much to trust the number before they read it. */}
        <p className="meimar-disclaimer">
          {interpolate(dictionary.valuation.accuracy, {
            pct: `${metrics.built.medianErrorPct.toFixed(1)}%`,
          })}
        </p>
      </header>

      <EstimateForm dictionary={dictionary} bounds={bounds} />
      </main>

      <SiteFooter locale={locale} dictionary={dictionary} />
    </>
  );
}

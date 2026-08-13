import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentPage } from "@/components/ContentPage";
import { getDictionary, interpolate } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadModelMetrics } from "@/lib/model-metrics.server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { pages, brand } = getDictionary(locale);
  return {
    title: `${pages.methodology.title} — ${brand}`,
    description: pages.methodology.lede,
  };
}

export default async function MethodologyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const { methodology } = dictionary.pages;

  // The accuracy figures are read from the trained models rather than written
  // into the copy, so this page cannot claim an accuracy the models no longer
  // have after a retrain.
  const metrics = await loadModelMetrics();
  const modelBody = methodology.modelBody.map((paragraph) =>
    interpolate(paragraph, {
      builtPct: `${metrics.built.medianErrorPct.toFixed(1)}%`,
      landPct: `${metrics.land.medianErrorPct.toFixed(1)}%`,
    }),
  );

  return (
    <ContentPage
      locale={locale}
      dictionary={dictionary}
      title={methodology.title}
      lede={methodology.lede}
      sections={[
        { heading: methodology.pricesTitle, body: methodology.pricesBody },
        { heading: methodology.modelTitle, body: modelBody },
        { heading: methodology.servicesTitle, body: methodology.servicesBody },
        { heading: methodology.districtsTitle, body: methodology.districtsBody },
      ]}
    />
  );
}

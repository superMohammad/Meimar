import { notFound } from "next/navigation";

import { ListingView } from "@/components/ListingView";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadModelMetrics } from "@/lib/model-metrics.server";

/**
 * A shareable page for one listing.
 *
 * Deliberately not prerendered. There are 781K listings and they churn, so an
 * SSG pass over them would cost a great deal to produce pages that go stale;
 * district pages carry the search value instead. What is needed here is a URL
 * someone can send, and rendering in the browser off the same DuckDB path the
 * map panel already uses satisfies that without new machinery.
 */
export default async function ListingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) notFound();

  const dictionary = getDictionary(locale);
  const metrics = await loadModelMetrics();

  return (
    <>
      <SiteHeader locale={locale} dictionary={dictionary} />
      <main id="main" tabIndex={-1} className="meimar-page">
        <ListingView
          locale={locale}
          dictionary={dictionary}
          listingId={listingId}
          metrics={metrics}
        />
      </main>
      <SiteFooter locale={locale} dictionary={dictionary} />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DistrictBrowser } from "@/components/DistrictBrowser";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadDistricts } from "@/lib/site-stats.server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale);
  return {
    title: `${dictionary.nav.districts} — ${dictionary.brand}`,
    description: dictionary.districtPage.indexLede,
  };
}

export default async function DistrictsIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const rows = await loadDistricts();

  return (
    <>
      <SiteHeader locale={locale} dictionary={dictionary} />

      <main id="main" tabIndex={-1} className="meimar-page">
        <h1>{dictionary.nav.districts}</h1>
        <p className="meimar-page-lede">{dictionary.districtPage.indexLede}</p>

        {/* The list is rendered on the server and hydrated for search, so the
            districts are in the HTML for crawlers and readable without JS. */}
        <DistrictBrowser locale={locale} dictionary={dictionary} rows={rows} />
      </main>

      <SiteFooter locale={locale} dictionary={dictionary} />
    </>
  );
}

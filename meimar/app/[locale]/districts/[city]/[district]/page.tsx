import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { formatDistance, formatNumber, formatPrice } from "@/lib/format";
import { getDictionary, interpolate } from "@/lib/i18n";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/types";
import { loadDistricts } from "@/lib/site-stats.server";
import { districtFromSlug, districtSlug, type DistrictRow } from "@/lib/site-stats";

/**
 * One page per (city, district).
 *
 * These are the site's search surface: a district name is what people actually
 * type, and there are 1,480 of them with enough listings to say something true
 * about. Only districts the build marked `sufficient` are emitted, so a page
 * never exists for a neighborhood whose median rests on three listings.
 */

async function findDistrict(citySlug: string, districtSlugValue: string): Promise<DistrictRow | null> {
  const city = districtFromSlug(citySlug);
  const district = districtFromSlug(districtSlugValue);
  const rows = await loadDistricts();
  return rows.find((row) => row.city === city && row.district === district) ?? null;
}

export async function generateStaticParams(): Promise<
  { locale: string; city: string; district: string }[]
> {
  const rows = await loadDistricts();
  return LOCALES.flatMap((locale) =>
    rows.map((row) => ({
      locale,
      city: districtSlug(row.city),
      district: districtSlug(row.district),
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; city: string; district: string }>;
}): Promise<Metadata> {
  const { locale, city, district } = await params;
  if (!isLocale(locale)) return {};
  const row = await findDistrict(city, district);
  if (row === null) return {};

  const dictionary = getDictionary(locale);
  return {
    title: `${row.district} · ${row.city} — ${dictionary.brand}`,
    description: interpolate(dictionary.districtPage.metaDescription, {
      district: row.district,
      city: row.city,
      count: formatNumber(row.listing_count),
    }),
  };
}

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ locale: string; city: string; district: string }>;
}) {
  const { locale, city, district } = await params;
  if (!isLocale(locale)) notFound();

  const row = await findDistrict(city, district);
  if (row === null) notFound();

  const dictionary = getDictionary(locale);
  const typedLocale: Locale = locale;

  return (
    <>
      <SiteHeader locale={typedLocale} dictionary={dictionary} />

      <main id="main" tabIndex={-1} className="meimar-page">
        <nav className="meimar-crumbs" aria-label={dictionary.nav.districts}>
          <Link href={`/${locale}/districts`}>{dictionary.nav.districts}</Link>
          <span aria-hidden="true">/</span>
          <span>{row.city}</span>
        </nav>

        <h1>{row.district}</h1>
        <p className="meimar-page-lede">
          {interpolate(dictionary.districtPage.lede, {
            district: row.district,
            city: row.city,
            count: formatNumber(row.listing_count),
          })}
        </p>

        <dl className="meimar-stats meimar-stats-wide">
          <div>
            <dt>{dictionary.district.listings}</dt>
            <dd className="tabular">{formatNumber(row.listing_count)}</dd>
          </div>
          {row.median_price !== null && (
            <div>
              <dt>{dictionary.district.medianPrice}</dt>
              <dd className="tabular">{formatPrice(row.median_price, dictionary)}</dd>
            </div>
          )}
          {row.median_price_per_m2 !== null && (
            <div>
              <dt>{dictionary.district.medianPricePerM2}</dt>
              <dd className="tabular">
                {formatNumber(row.median_price_per_m2)} {dictionary.units.sarPerSqm}
              </dd>
            </div>
          )}
        </dl>

        {/* The district median mixes property types, so it is labelled as a
            spread across all listings rather than presented as "the" price.
            The per-type figures live on the map, where a type is selected. */}
        <p className="meimar-disclaimer">{dictionary.districtPage.mixedTypes}</p>

        <section>
          <h2>{dictionary.districtPage.exploreTitle}</h2>
          <p>{dictionary.districtPage.exploreBody}</p>
          <Link className="meimar-button" href={`/${locale}/map`}>
            {dictionary.landing.openMap}
          </Link>
        </section>

        <p className="meimar-disclaimer">
          {dictionary.disclaimer}{" "}
          <Link href={`/${locale}/methodology`}>{dictionary.nav.methodology}</Link>
        </p>
      </main>

      <SiteFooter locale={typedLocale} dictionary={dictionary} />
    </>
  );
}

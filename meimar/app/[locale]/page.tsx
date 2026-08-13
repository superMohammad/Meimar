import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { formatNumber } from "@/lib/format";
import { getDictionary, interpolate } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";
import { loadModelMetrics } from "@/lib/model-metrics.server";
import { loadDistricts, loadSiteStats } from "@/lib/site-stats.server";
import { districtSlug } from "@/lib/site-stats";

/** How many districts the landing page lists. Enough to show breadth. */
const FEATURED_DISTRICTS = 8;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const [stats, districts, metrics] = await Promise.all([
    loadSiteStats(),
    loadDistricts(),
    loadModelMetrics(),
  ]);

  const featured = districts.slice(0, FEATURED_DISTRICTS);

  return (
    <>
      <SiteHeader locale={locale} dictionary={dictionary} />

      <main id="main" tabIndex={-1} className="meimar-landing">
        <section className="meimar-hero">
          <h1>{dictionary.landing.headline}</h1>
          <p className="meimar-hero-sub">{dictionary.landing.sub}</p>

          <div className="meimar-hero-actions">
            <Link className="meimar-button" href={`/${locale}/map`}>
              {dictionary.landing.openMap}
            </Link>
            <Link className="meimar-button is-secondary" href={`/${locale}/estimate`}>
              {dictionary.landing.tryEstimate}
            </Link>
          </div>

          {/* Every figure here comes from the built data, so the page cannot
              claim coverage the dataset does not have. */}
          <dl className="meimar-hero-stats">
            {(
              [
                [formatNumber(stats.listings), dictionary.landing.statListings],
                [formatNumber(stats.with_estimate), dictionary.landing.statEstimates],
                [formatNumber(stats.districts), dictionary.landing.statDistricts],
                [`${metrics.built.medianErrorPct.toFixed(1)}%`, dictionary.landing.statAccuracy],
              ] as const
            ).map(([value, label]) => (
              <div key={label}>
                <dt className="tabular">{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="meimar-features">
          {(
            [
              [dictionary.landing.featureMapTitle, dictionary.landing.featureMapBody, "map"],
              [dictionary.landing.featureValueTitle, dictionary.landing.featureValueBody, "estimate"],
              [dictionary.landing.featureAreaTitle, dictionary.landing.featureAreaBody, "districts"],
            ] as const
          ).map(([title, body, slug]) => (
            <article key={slug}>
              <h2>{title}</h2>
              <p>{body}</p>
              <Link href={`/${locale}/${slug}`}>{dictionary.landing.more}</Link>
            </article>
          ))}
        </section>

        <section className="meimar-featured-districts">
          <h2>{dictionary.landing.popularDistricts}</h2>
          <ul>
            {featured.map((district) => (
              <li key={`${district.city}|${district.district}`}>
                <Link
                  href={`/${locale}/districts/${districtSlug(district.city)}/${districtSlug(district.district)}`}
                >
                  <span className="meimar-district-name">{district.district}</span>
                  <span className="meimar-district-city">{district.city}</span>
                  <span className="meimar-district-price tabular">
                    {district.median_price_per_m2 === null
                      ? "—"
                      : `${formatNumber(district.median_price_per_m2)} ${dictionary.units.sarPerSqm}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/districts`}>{dictionary.landing.allDistricts}</Link>
        </section>

        {/* The honest positioning, on the front page rather than buried in a
            footnote. It is what the product is, not a caveat. */}
        <section className="meimar-honesty">
          <h2>{dictionary.landing.honestyTitle}</h2>
          <p>
            {interpolate(dictionary.landing.honestyBody, {
              pct: `${metrics.built.medianErrorPct.toFixed(1)}%`,
            })}
          </p>
          <Link href={`/${locale}/methodology`}>{dictionary.nav.methodology}</Link>
        </section>
      </main>

      <SiteFooter locale={locale} dictionary={dictionary} />
    </>
  );
}

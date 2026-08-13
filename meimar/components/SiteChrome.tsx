import Link from "next/link";

import { BrandLink } from "./BrandMark";

import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * Header and footer for the content pages.
 *
 * Server components: they render links and text and hold no state, so shipping
 * them as client JavaScript would buy nothing.
 *
 * The map deliberately does not use these. It is a full-viewport application
 * view with its own chrome; a document header above it would eat the space the
 * map needs and put two navigations on one screen.
 */

type ChromeProps = {
  locale: Locale;
  dictionary: Dictionary;
};

export function SiteHeader({ locale, dictionary }: ChromeProps) {
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";

  const links = [
    ["map", dictionary.nav.map],
    ["estimate", dictionary.nav.estimate],
    ["districts", dictionary.nav.districts],
    ["methodology", dictionary.nav.methodology],
    ["about", dictionary.nav.about],
  ] as const;

  return (
    <header className="meimar-site-header">
      <BrandLink locale={locale} dictionary={dictionary} prefetch />

      <nav aria-label={dictionary.nav.menu}>
        {links.map(([slug, label]) => (
          <Link key={slug} href={`/${locale}/${slug}`}>
            {label}
          </Link>
        ))}
      </nav>

      <Link className="meimar-locale-switch" href={`/${otherLocale}`} prefetch={false}>
        {dictionary.nav.language}
      </Link>
    </header>
  );
}

export function SiteFooter({ locale, dictionary }: ChromeProps) {
  const links = [
    ["about", dictionary.nav.about],
    ["methodology", dictionary.nav.methodology],
    ["contact", dictionary.nav.contact],
    ["privacy", dictionary.nav.privacy],
    ["terms", dictionary.nav.terms],
  ] as const;

  return (
    <footer className="meimar-site-footer">
      <nav aria-label={dictionary.nav.menu}>
        {links.map(([slug, label]) => (
          <Link key={slug} href={`/${locale}/${slug}`}>
            {label}
          </Link>
        ))}
      </nav>
      {/* The positioning statement travels with every page, not just the
          listing cards: asking prices are the foundation of everything here. */}
      <p>{dictionary.disclaimer}</p>
      <p className="meimar-footer-brand">{dictionary.brand}</p>
    </footer>
  );
}

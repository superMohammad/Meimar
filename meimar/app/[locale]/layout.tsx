import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { thmanyahDisplay, thmanyahSans } from "@/lib/fonts";
import { getDictionary } from "@/lib/i18n";
import { LOCALES, directionOf, isLocale } from "@/lib/i18n/types";

import "../globals.css";

/**
 * Root layout. It lives under `[locale]` rather than at `app/` because `lang`
 * and `dir` on <html> have to know the locale, and Next.js treats the topmost
 * layout as the root.
 */

export function generateStaticParams(): { locale: string }[] {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * Matches the page background so mobile browser chrome does not sit against a
 * colour the page never uses. Two entries because the palette has a dark mode.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdfb" },
    { media: "(prefers-color-scheme: dark)", color: "#17120e" },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale);
  return {
    title: `${dictionary.brand} — ${dictionary.tagline}`,
    description: dictionary.tagline,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={`${thmanyahSans.variable} ${thmanyahDisplay.variable}`}
    >
      <head>
        {/* The map's first paint is a burst of tile requests to a third-party
            host. Opening the TCP and TLS connection while the page is still
            parsing takes that handshake off the critical path. */}
        <link rel="preconnect" href="https://server.arcgisonline.com" />
        <link rel="dns-prefetch" href="https://server.arcgisonline.com" />
      </head>
      <body>
        {/* First tab stop on every page. Without it, reaching the content of
            the map means tabbing through the whole filter bar. */}
        <a className="meimar-skip-link" href="#main">
          {dictionary.nav.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}

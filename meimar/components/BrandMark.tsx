import Link from "next/link";

import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * The Meimar lockup: a stylised arch and the wordmark, always linking home.
 *
 * One definition, used by both headers. The mark used to be pasted into
 * `SiteChrome` and `MapExplorer` as identical SVG path data, and the two had
 * already drifted in the way that matters: the content pages wrapped it in a
 * link and the map did not, so the logo navigated home everywhere except the
 * screen people actually sit on.
 *
 * No `"use client"`: this renders links and text and holds no state, so it can
 * be used from the server-rendered content pages and pulled into the map's
 * client bundle without either one paying for the other.
 */

const ARCH = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
    <path d="M4 21V11a8 8 0 0 1 16 0v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 21h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 21v-6a2 2 0 0 1 4 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type BrandLinkProps = {
  locale: Locale;
  dictionary: Dictionary;
  /**
   * Whether to prefetch the landing page.
   *
   * Off on the map: the landing page loads site stats, the district list and
   * model metrics, and the map should not pay for that just because the
   * pointer crossed the logo.
   */
  prefetch: boolean;
};

export function BrandLink({ locale, dictionary, prefetch }: BrandLinkProps) {
  return (
    <Link href={`/${locale}`} className="meimar-brand" prefetch={prefetch}>
      <span className="meimar-logo" aria-hidden="true">
        {ARCH}
      </span>
      <span className="meimar-wordmark" translate="no">
        {dictionary.brand}
      </span>
    </Link>
  );
}

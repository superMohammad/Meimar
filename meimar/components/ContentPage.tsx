import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * Shell for the prose pages: header, a titled article, footer.
 *
 * Five pages differing only in their text do not need five layouts.
 */

export type Section = {
  heading: string;
  body: readonly string[];
};

type ContentPageProps = {
  locale: Locale;
  dictionary: Dictionary;
  title: string;
  lede?: string;
  sections: readonly Section[];
  /** Shown above the sections, for pages awaiting legal review. */
  notice?: string;
};

export function ContentPage({
  locale,
  dictionary,
  title,
  lede,
  sections,
  notice,
}: ContentPageProps) {
  return (
    <>
      <SiteHeader locale={locale} dictionary={dictionary} />

      <main id="main" tabIndex={-1} className="meimar-page meimar-prose">
        <h1>{title}</h1>
        {lede !== undefined && <p className="meimar-page-lede">{lede}</p>}
        {notice !== undefined && <p className="meimar-notice">{notice}</p>}

        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </main>

      <SiteFooter locale={locale} dictionary={dictionary} />
    </>
  );
}

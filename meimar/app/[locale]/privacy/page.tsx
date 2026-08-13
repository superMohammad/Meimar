import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentPage } from "@/components/ContentPage";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { pages, brand } = getDictionary(locale);
  return { title: `${pages.privacy.title} — ${brand}`, description: pages.privacy.lede };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const { privacy } = dictionary.pages;

  return (
    <ContentPage
      locale={locale}
      dictionary={dictionary}
      title={privacy.title}
      lede={privacy.lede}
      // Marked as a draft on the page itself. Publishing placeholder text as
      // though it were a finished privacy policy would misrepresent what the
      // platform has actually committed to.
      notice={privacy.notice}
      sections={[
        { heading: privacy.collectTitle, body: privacy.collectBody },
        { heading: privacy.futureTitle, body: privacy.futureBody },
      ]}
    />
  );
}

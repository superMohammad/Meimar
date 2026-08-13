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
  return { title: `${pages.about.title} — ${brand}`, description: pages.about.lede };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const { about } = dictionary.pages;

  return (
    <ContentPage
      locale={locale}
      dictionary={dictionary}
      title={about.title}
      lede={about.lede}
      sections={[
        { heading: about.whatTitle, body: about.whatBody },
        { heading: about.whyTitle, body: about.whyBody },
      ]}
    />
  );
}

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
  return { title: `${pages.terms.title} — ${brand}`, description: pages.terms.lede };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const { terms } = dictionary.pages;

  return (
    <ContentPage
      locale={locale}
      dictionary={dictionary}
      title={terms.title}
      lede={terms.lede}
      notice={terms.notice}
      sections={[
        { heading: terms.useTitle, body: terms.useBody },
        { heading: terms.contentTitle, body: terms.contentBody },
      ]}
    />
  );
}

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
  return { title: `${pages.contact.title} — ${brand}`, description: pages.contact.lede };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const { contact } = dictionary.pages;

  return (
    <ContentPage
      locale={locale}
      dictionary={dictionary}
      title={contact.title}
      lede={contact.lede}
      sections={[
        { heading: contact.dataTitle, body: contact.dataBody },
        { heading: contact.generalTitle, body: contact.generalBody },
      ]}
    />
  );
}

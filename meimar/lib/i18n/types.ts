/**
 * Locale contract for Meimar.
 *
 * `Dictionary` is derived from the Arabic dictionary, which is the source of
 * truth: Arabic is the default locale and the one the product is designed in.
 * Every other locale must satisfy the same key set, so a missing or misspelled
 * translation is a compile error rather than a blank label at runtime.
 */

export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

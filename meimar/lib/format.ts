import type { Dictionary } from "./i18n";
import type { Locale } from "./i18n/types";

/**
 * Number and distance formatting.
 *
 * Western numerals are used in both locales. Arabic-Indic digits are correct
 * Arabic, but Saudi property listings, the source data and the map labels are
 * overwhelmingly written with Western digits, and mixing the two inside one
 * interface reads worse than choosing one.
 */

const GROUPING_LOCALE = "en-US";

/**
 * Drop a trailing ".0" / ".00" without touching the integer part.
 *
 * The guard is the whole point. A bare `replace(/\.?0+$/, "")` also eats the
 * significant zeros of a whole number -- "120" became "12" and "100" became
 * "1" -- which mislabelled 243,303 of 781,382 listings on the map by a factor
 * of ten or a hundred. Only a string with a decimal point has a fraction to
 * trim.
 */
function trimFraction(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(GROUPING_LOCALE).format(Math.round(value));
}

/**
 * Compact number for places a full figure would not fit — map labels, legend
 * bands. Carries no unit, so the caller decides whether one is needed.
 *
 * Arabic gets its own scale words rather than a transliterated "M": a pin
 * reading "١.٩ M" would be neither language.
 */
export function formatNumberCompact(value: number, locale: Locale): string {
  const billion = 1_000_000_000;
  const million = 1_000_000;
  const thousand = 1_000;

  // 247 listings in this dataset ask more than a billion riyals, topping out
  // at 100,000,050,000 -- almost certainly mistyped, but they are in the data
  // and they land on the map. Without this tier they rendered as "100000
  // مليون", a nine-character pill that says nothing at a glance.
  if (value >= billion) {
    const scaled = value / billion;
    const number = trimFraction(scaled.toFixed(scaled < 10 ? 2 : 1));
    return locale === "ar" ? `${number} مليار` : `${number}B`;
  }
  if (value >= million) {
    const scaled = value / million;
    const digits = scaled < 10 ? 2 : 1;
    const number = trimFraction(scaled.toFixed(digits));
    return locale === "ar" ? `${number} مليون` : `${number}M`;
  }
  if (value >= thousand) {
    const scaled = value / thousand;
    const number = trimFraction(scaled.toFixed(scaled < 10 ? 1 : 0));
    return locale === "ar" ? `${number} ألف` : `${number}K`;
  }
  return formatNumber(value);
}

/**
 * Compact price for map labels, where a full figure would not fit.
 *
 * Only sub-thousand figures carry the currency word: above that the scale word
 * ("2.4M", "٢.٤ مليون") already reads as money in context, and a pin is too
 * small to spend characters on a unit the reader can infer.
 */
export function formatPriceCompact(
  value: number,
  locale: Locale,
  dictionary: Dictionary,
): string {
  const compact = formatNumberCompact(value, locale);
  return value >= 1_000 ? compact : `${compact} ${dictionary.units.sar}`;
}

export function formatPrice(value: number, dictionary: Dictionary): string {
  return `${formatNumber(value)} ${dictionary.units.sar}`;
}

export function formatArea(value: number, dictionary: Dictionary): string {
  return `${formatNumber(value)} ${dictionary.units.sqm}`;
}

/** Metres below 1 km, kilometres above, with one decimal. */
export function formatDistance(metres: number, dictionary: Dictionary): string {
  if (!Number.isFinite(metres)) return "—";
  if (metres < 1_000) return `${Math.round(metres)} ${dictionary.units.m}`;
  return `${(metres / 1_000).toFixed(1)} ${dictionary.units.km}`;
}

export function formatRadius(metres: number, dictionary: Dictionary): string {
  return metres < 1_000
    ? `${metres} ${dictionary.units.m}`
    : `${metres / 1_000} ${dictionary.units.km}`;
}

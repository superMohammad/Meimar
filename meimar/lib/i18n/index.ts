import { ar, type Dictionary } from "./ar";
import { en } from "./en";
import type { Locale } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * Fill `{name}` placeholders in a dictionary string.
 *
 * Kept deliberately small: the only interpolation the UI needs is substituting
 * already-formatted numbers into a sentence.
 */
export function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

export type { Dictionary };
export { ar, en };
export * from "./types";

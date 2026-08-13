"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";

import { formatNumber } from "@/lib/format";
import { interpolate, type Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { districtSlug, type DistrictRow } from "@/lib/site-stats";

/**
 * Searchable index of every district.
 *
 * There are 1,342 of them. A plain list is unusable — nobody scrolls a country
 * to find حي الملقا — so the page is a filter first and a list second.
 *
 * Filtering runs on a deferred copy of the query, so typing stays responsive
 * while the (large) list re-renders behind it. The list itself is not
 * virtualised: `content-visibility: auto` on each city block already lets the
 * browser skip layout and paint for off-screen sections, which costs one CSS
 * declaration instead of a dependency.
 */

type DistrictBrowserProps = {
  locale: Locale;
  dictionary: Dictionary;
  rows: readonly DistrictRow[];
};

type CityGroup = {
  city: string;
  districts: DistrictRow[];
  total: number;
};

/** Arabic is written with several forms of alef and a taa marbuta that users
 *  type interchangeably; folding them means "الملقا" finds "المـلقا" variants
 *  and a search for "حي" is not required to match a district named "حي X". */
function fold(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ً-ْ]/g, "")
    .replace(/^حي\s+/, "")
    .trim()
    .toLowerCase();
}

function groupByCity(rows: readonly DistrictRow[]): CityGroup[] {
  const groups = new Map<string, DistrictRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.city);
    if (existing) existing.push(row);
    else groups.set(row.city, [row]);
  }

  return [...groups.entries()]
    .map(([city, districts]) => ({
      city,
      districts,
      total: districts.reduce((sum, row) => sum + row.listing_count, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export function DistrictBrowser({ locale, dictionary, rows }: DistrictBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputId = useId();

  // Precomputed once: folding 1,342 names on every keystroke is wasted work,
  // and the source list never changes.
  const searchable = useMemo(
    () => rows.map((row) => ({ row, key: `${fold(row.district)} ${fold(row.city)}` })),
    [rows],
  );

  const groups = useMemo(() => {
    const needle = fold(deferredQuery);
    const matched =
      needle === ""
        ? rows
        : searchable.filter((entry) => entry.key.includes(needle)).map((entry) => entry.row);
    return { list: groupByCity(matched), count: matched.length };
  }, [deferredQuery, rows, searchable]);

  return (
    <>
      <div className="meimar-search">
        <label htmlFor={inputId}>{dictionary.districtPage.searchLabel}</label>
        <input
          id={inputId}
          type="search"
          name="district"
          autoComplete="off"
          spellCheck={false}
          placeholder={dictionary.districtPage.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Announced politely so a screen reader hears the result count change
          without the list stealing focus on every keystroke. */}
      <p className="meimar-search-count" role="status" aria-live="polite">
        {interpolate(dictionary.districtPage.resultCount, {
          count: formatNumber(groups.count),
        })}
        {" · "}
        {/* The column of bare numbers is meaningless without its unit, and the
            figure mixes property types, which is why some land-heavy districts
            read far lower than their neighbours. */}
        {dictionary.districtPage.columnNote}
      </p>

      {groups.count === 0 ? (
        <p className="meimar-empty">{dictionary.districtPage.noResults}</p>
      ) : (
        groups.list.map((group) => (
          <section key={group.city} className="meimar-city-block">
            <h2>
              {group.city}{" "}
              <span className="meimar-count tabular">
                {formatNumber(group.districts.length)}
              </span>
            </h2>
            <ul className="meimar-district-list">
              {group.districts.map((row) => (
                <li key={row.district}>
                  <Link
                    href={`/${locale}/districts/${districtSlug(group.city)}/${districtSlug(row.district)}`}
                  >
                    <span>{row.district}</span>
                    <span
                      className="tabular"
                      title={`${dictionary.district.medianPricePerM2} · ${dictionary.units.sarPerSqm}`}
                    >
                      {row.median_price_per_m2 === null
                        ? "—"
                        : formatNumber(row.median_price_per_m2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

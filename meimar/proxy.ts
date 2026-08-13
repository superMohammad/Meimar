import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/types";

/**
 * Sends locale-less paths to the default locale, so `/` lands on `/ar`.
 *
 * The matcher excludes anything that looks like a file, matched by the dot in
 * its name rather than by listing directories, plus the API prefix. Redirecting
 * either into a locale breaks it: the DuckDB worker, the WASM binary and the
 * Parquet files are all fetched from absolute paths, and a 307 on any of them
 * fails the whole data layer. An extension test cannot drift out of date the
 * way a hand-kept list of directories does.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // `api` is excluded alongside `_next` and any path with a file extension.
  // It is not a page, so sending it to a locale turns every estimate request
  // into a redirect to `/ar/api/estimate`, which 404s.
  //
  // Serving `duckdb-eh.wasm.gz` from here was tried and reverted: Next gzips
  // the response for transfer on top of the already-gzipped file, the browser
  // strips one layer, and the worker receives gzip bytes where it expects a
  // module. Compression of `application/wasm` belongs at the CDN or reverse
  // proxy — see the note in `scripts/copy-duckdb-assets.mjs`.
  matcher: ["/((?!_next|api|.*\\.).*)"],
};

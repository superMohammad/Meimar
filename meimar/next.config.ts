import type { NextConfig } from "next";

/**
 * The estimate service runs as a separate Python process (see `api/`), because
 * the valuation models are XGBoost boosters with categorical splits and cannot
 * run in the browser. Proxying it under the app's own origin keeps that an
 * implementation detail: the client calls `/api/estimate` and never learns
 * there is a second server.
 */
const ESTIMATE_SERVICE = process.env.ESTIMATE_SERVICE_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${ESTIMATE_SERVICE}/api/:path*` }];
  },

  async headers() {
    return [
      {
        // The DuckDB engine is 36 MB of WebAssembly plus a 0.8 MB worker.
        // Next serves everything under `public/` as `max-age=0`, so a phone
        // revalidated all of it on every single visit and re-downloaded it
        // whenever the heuristic cache had evicted it -- by far the largest
        // cost on the map, and pure waste.
        //
        // Immutable is honest here: `scripts/copy-duckdb-assets.mjs` copies
        // these out of `node_modules` on every pre-dev/pre-build, so their
        // content is pinned to the exact `@duckdb/duckdb-wasm` version in
        // package.json. A version bump changes the bytes; nothing else does.
        source: "/duckdb/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // The service worker must never be long-cached: it is the only thing
        // that can retire a bad version of itself, and a browser holding a
        // year-old copy could not be told about a fix.
        source: "/duckdb-sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        // Parquet and the derived JSON are read with HTTP range requests, so
        // these are revalidated rather than frozen: `pnpm data:build` rewrites
        // them, and serving a year-old map would be worse than a round trip.
        // `stale-while-revalidate` keeps that round trip off the critical path
        // -- the browser paints from cache and refreshes in the background.
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

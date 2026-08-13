/**
 * Keeps the DuckDB engine out of the network on repeat visits.
 *
 * The module is 34.3 MB decoded. Chrome refuses to put an entry that large in
 * its HTTP cache, so `Cache-Control: immutable` never applies to it: measured
 * back-to-back, the same URL took 8,304 ms and then 8,305 ms. Every visit paid
 * roughly eight seconds of 4G to fetch bytes that had not changed.
 *
 * Cache Storage has no per-entry ceiling -- only the origin quota -- so a
 * service worker scoped to nothing but `/duckdb/` can hold the engine across
 * visits. The worker passes every other request straight through, so it cannot
 * affect pages, data, or tiles even if it misbehaves.
 *
 * The first visit is unchanged: a service worker does not control the page that
 * registers it. The saving is on every visit after that.
 */

const SERVICE_WORKER_URL = "/duckdb-sw.js";

/**
 * Registration is fire-and-forget and must stay that way.
 *
 * Nothing waits on it: if it fails, is unsupported, or the browser is in a
 * private window that refuses it, DuckDB still boots from the network exactly
 * as it does today. A cache is an optimisation, and an optimisation that can
 * break the product when it fails is not worth having.
 */
export function registerEngineCache(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  void navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((cause: unknown) => {
    // Logged, not thrown, and never surfaced to the user: the only consequence
    // is a slower load.
    console.warn("engine cache unavailable", cause);
  });
}

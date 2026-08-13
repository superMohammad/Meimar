"""Emit the three static Parquet files the browser reads.

Meimar has no tile server and no listings API. DuckDB-WASM reads these files
directly from `public/data` over HTTP range requests, which the Next.js static
handler serves as 206 Partial Content. The split between them is about what a
given interaction has to download:

`map.parquet` (~13 MB)
    Every column the map and the filter bar touch, for all 781K listings.
    Spatially ordered so a viewport query hits few row groups. Small enough
    that the whole file can be read repeatedly without care.

`details.parquet` (~119 MB)
    The Arabic title and body plus the per-listing POI numbers. Far too large
    to load, so it is ordered by `id` and written with small row groups: one
    pin click range-fetches roughly 310 KB rather than the file.

`districts.parquet` (~126 KB)
    Per-neighborhood aggregates, loaded eagerly.

Run `enrich_pois.py` first; this script joins its output.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Final

import duckdb

SAUDI_BBOX: Final[tuple[float, float, float, float]] = (16.0, 33.0, 34.0, 56.0)

# One viewport's worth of pins fits in a fraction of a row group, but panning
# should not refetch the world. 50K keeps map.parquet at ~14 row groups.
MAP_ROW_GROUP_SIZE: Final[int] = 50_000

# Sized so a single listing lookup pulls ~310 KB. Larger groups mean a click
# downloads megabytes; smaller ones inflate the footer and the file.
DETAILS_ROW_GROUP_SIZE: Final[int] = 2_000

# `price` runs to 100,000,050,000 SAR in the source -- placeholder values, not
# real asks. The filter UI must clamp its slider to a percentile rather than to
# max(price), or the control becomes unusable.
PRICE_SLIDER_PERCENTILE: Final[float] = 0.995

# A median price per square metre needs enough listings behind it to mean
# anything. Segmenting by type as well as district splits the data thin, so
# combinations below this are omitted rather than shaded on the map.
MIN_LISTINGS_FOR_PRICE_STATS: Final[int] = 5


def build_map_parquet(
    connection: duckdb.DuckDBPyConnection,
    source_parquet: Path,
    poi_parquet: Path,
    estimates_parquet: Path,
    destination: Path,
) -> None:
    """Write the slim, spatially ordered file that backs the map and the filters.

    Estimates join LEFT: they exist only for sale listings inside the price
    bounds the models were fitted on, so rentals and out-of-bounds sales carry
    NULL and the UI shows "no estimate" rather than a number it should not.

    Rows are ordered by a coarse lat/lng grid so each row group covers a compact
    patch of the country and a viewport query can skip most of the file on its
    min/max statistics. An earlier version ordered by H3 cell, which served the
    same purpose; the H3 columns themselves are gone because the map now draws a
    density surface from real coordinates rather than from cell centroids, and
    nothing else read them.
    """
    lat_min, lat_max, lng_min, lng_max = SAUDI_BBOX

    connection.sql(
        f"""
        COPY (
            SELECT
                s.id,
                CAST(s."location.lat" AS FLOAT)  AS lat,
                CAST(s."location.lng" AS FLOAT)  AS lng,
                s.price,
                s.area,
                CAST(s.beds AS SMALLINT)         AS beds,
                s.estate_type,
                s.estate_benefit,
                s.city,
                s.district,
                s.last_update,
                e.estimate,
                e.estimate_low,
                e.estimate_high,
                -- Signed, so the sign carries the direction: positive means the
                -- asking price sits above what comparable listings ask.
                CASE WHEN e.estimate > 0
                     THEN round((s.price - e.estimate) / e.estimate, 4)
                END AS price_delta_pct
            FROM read_parquet('{source_parquet}') s
            JOIN read_parquet('{poi_parquet}') p ON s.id = p.id
            LEFT JOIN read_parquet('{estimates_parquet}') e ON s.id = e.id
            WHERE s."location.lat" BETWEEN {lat_min} AND {lat_max}
              AND s."location.lng" BETWEEN {lng_min} AND {lng_max}
            ORDER BY floor(lat * 10), floor(lng * 10)
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE {MAP_ROW_GROUP_SIZE})
        """
    )


def build_details_parquet(
    connection: duckdb.DuckDBPyConnection,
    source_parquet: Path,
    poi_parquet: Path,
    destination: Path,
) -> None:
    """Write the id-ordered file the detail panel range-reads one row group of."""
    lat_min, lat_max, lng_min, lng_max = SAUDI_BBOX

    connection.sql(
        f"""
        COPY (
            SELECT
                s.id,
                s.title,
                s.content,
                s.beds,
                s.livings,
                s.wc,
                s.area,
                s.street_width,
                s.age,
                s.rooms,
                s.furnished,
                s.f_ac, s.f_parking, s.f_new, s.f_pool, s.f_kitchen, s.f_driver,
                s.f_basement, s.f_garden, s.f_two_entr, s.f_corner, s.f_near_masjid,
                s.f_investment, s.f_negotiable, s.f_urgent, s.f_near_park, s.f_yard,
                p.* EXCLUDE (id)
            FROM read_parquet('{source_parquet}') s
            JOIN read_parquet('{poi_parquet}') p ON s.id = p.id
            WHERE s."location.lat" BETWEEN {lat_min} AND {lat_max}
              AND s."location.lng" BETWEEN {lng_min} AND {lng_max}
            ORDER BY s.id
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE {DETAILS_ROW_GROUP_SIZE})
        """
    )


def build_district_prices(
    connection: duckdb.DuckDBPyConnection, source_parquet: Path, destination: Path
) -> None:
    """Price per square metre per (city, district, type, purpose).

    Segmented by property type deliberately. Within حي الملقا the median runs
    1,432 SAR/m2 for a store, 7,000 for land, 8,158 for an apartment and 12,333
    for a villa, so a single district figure would compare a plot of ground with
    a finished villa. A choropleth shaded on the unsegmented number maps which
    property types a district happens to advertise, not what land there costs.

    Feeds two things: the map's price layer, and the comparables line under each
    estimate.
    """
    lat_min, lat_max, lng_min, lng_max = SAUDI_BBOX

    connection.sql(
        f"""
        COPY (
            SELECT
                city,
                district,
                estate_type,
                estate_benefit,
                count(*)                                            AS listing_count,
                round(median(price / area))                         AS median_price_per_m2,
                round(quantile_cont(price / area, 0.25))            AS p25_price_per_m2,
                round(quantile_cont(price / area, 0.75))            AS p75_price_per_m2,
                round(median(price))                                AS median_price
            FROM read_parquet('{source_parquet}')
            WHERE "location.lat" BETWEEN {lat_min} AND {lat_max}
              AND "location.lng" BETWEEN {lng_min} AND {lng_max}
              AND area > 0 AND price > 0
              AND city IS NOT NULL AND district IS NOT NULL
            GROUP BY ALL
            HAVING count(*) >= {MIN_LISTINGS_FOR_PRICE_STATS}
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )


def build_site_json(
    connection: duckdb.DuckDBPyConnection, map_parquet: Path, districts_parquet: Path,
    output_dir: Path,
) -> None:
    """Emit the JSON the content pages read on the server.

    The district and landing pages need aggregates and a district list. Both are
    small, and computing them here means the pages state what the data actually
    contains rather than a figure typed into the copy that goes stale the first
    time the data is rebuilt.

    JSON rather than Parquet because these are read by Next.js at build time,
    where `JSON.parse` costs nothing and a Parquet reader would be a dependency.
    """
    connection.sql(
        f"""
        COPY (
            SELECT
                count(*)                          AS listings,
                count(estimate)                   AS with_estimate,
                count(DISTINCT city)              AS cities,
                count(DISTINCT (city, district))  AS districts
            FROM read_parquet('{map_parquet}')
        ) TO '{output_dir / "site-stats.json"}' (FORMAT JSON, ARRAY false)
        """
    )
    connection.sql(
        f"""
        COPY (
            SELECT city, district, listing_count, median_price,
                   median_price_per_m2, sufficient
            FROM read_parquet('{districts_parquet}')
            WHERE sufficient
            ORDER BY listing_count DESC
        ) TO '{output_dir / "districts.json"}' (FORMAT JSON, ARRAY true)
        """
    )


def build_filter_bounds(
    connection: duckdb.DuckDBPyConnection, map_parquet: Path, destination: Path
) -> None:
    """Write the small JSON the filter bar needs before any query runs.

    Cities with their districts, the estate types actually present, and clamped
    price/area ceilings. Emitted as JSON rather than Parquet because the app
    needs it during the first render, before DuckDB has finished booting.
    """
    connection.sql(
        f"""
        COPY (
            WITH listings AS (SELECT * FROM read_parquet('{map_parquet}')),
            types AS (
                SELECT list(t) AS estate_types
                FROM (SELECT DISTINCT estate_type AS t FROM listings ORDER BY t)
            ),
            purposes AS (
                SELECT list(b) AS purposes
                FROM (SELECT DISTINCT estate_benefit AS b FROM listings ORDER BY b)
            ),
            per_city AS (
                SELECT city, list(district) AS districts
                FROM (SELECT DISTINCT city, district FROM listings ORDER BY city, district)
                GROUP BY city
            ),
            cities AS (
                SELECT list({{'city': city, 'districts': districts}}) AS cities
                FROM (SELECT * FROM per_city ORDER BY city)
            ),
            bounds AS (
                SELECT
                    CAST(quantile_cont(price, {PRICE_SLIDER_PERCENTILE})
                         FILTER (price > 0) AS BIGINT) AS price_max,
                    CAST(quantile_cont(area, {PRICE_SLIDER_PERCENTILE})
                         FILTER (area > 0) AS BIGINT) AS area_max
                FROM listings
            )
            SELECT types.estate_types, purposes.purposes, cities.cities,
                   bounds.price_max, bounds.area_max
            FROM types, purposes, cities, bounds
        ) TO '{destination}' (FORMAT JSON, ARRAY false)
        """
    )


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    source_parquet = (
        project_root.parent / "Saudi_REAL_ESTATE_PROJECT" / "data" / "real_estate_final.parquet"
    )
    enriched_dir = project_root / "data_enriched"
    poi_parquet = enriched_dir / "listing_pois.parquet"
    districts_source = enriched_dir / "districts.parquet"
    estimates_parquet = project_root / "models" / "oof_predictions.parquet"

    if not poi_parquet.exists():
        raise FileNotFoundError(f"{poi_parquet} not found. Run scripts/enrich_pois.py first.")
    if not estimates_parquet.exists():
        raise FileNotFoundError(
            f"{estimates_parquet} not found. Run scripts/train_models.py first."
        )

    output_dir = project_root / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    connection = duckdb.connect()

    map_parquet = output_dir / "map.parquet"
    print("building map.parquet", flush=True)
    build_map_parquet(connection, source_parquet, poi_parquet, estimates_parquet, map_parquet)

    print("building details.parquet", flush=True)
    build_details_parquet(connection, source_parquet, poi_parquet, output_dir / "details.parquet")

    print("copying districts.parquet", flush=True)
    connection.sql(
        f"""COPY (SELECT * FROM read_parquet('{districts_source}'))
            TO '{output_dir / "districts.parquet"}' (FORMAT PARQUET, COMPRESSION ZSTD)"""
    )

    print("building district_prices.parquet", flush=True)
    build_district_prices(connection, source_parquet, output_dir / "district_prices.parquet")

    print("building site-stats.json and districts.json", flush=True)
    build_site_json(
        connection, map_parquet, output_dir / "districts.parquet", output_dir
    )

    print("building filter-bounds.json", flush=True)
    build_filter_bounds(connection, map_parquet, output_dir / "filter-bounds.json")

    for path in sorted(output_dir.iterdir()):
        print(f"  {path.name:24} {path.stat().st_size / 1e6:8.1f} MB", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())

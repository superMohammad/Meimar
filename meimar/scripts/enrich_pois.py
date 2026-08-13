"""Offline amenity enrichment for Meimar listings.

For every listing this records, per amenity category, the distance to the nearest
feature and how many lie within 500 m / 1 km / 2 km. It also aggregates those
into per-neighborhood statistics.

Source data
-----------
Geofabrik's `gcc-states-latest-free.shp.zip`. Geofabrik publishes no standalone
Saudi extract; the GCC bundle covers Saudi plus five neighbours, which is what
we want anyway -- a listing in Khobar should see amenities across the Bahrain
causeway rather than a fabricated void at the border.

Both the point layers (`gis_osm_pois_free_1`, `gis_osm_pofw_free_1`) and the
area layers (`*_a_free_1`) are read. This is not optional: in this extract
hospitals and malls are mapped predominantly as polygons.

Distances are measured to the **actual geometry**, not to a polygon's centre.
An earlier version reduced every polygon to `representative_point()`, which
measured to the middle of a park rather than its edge and overstated distance by
a median of 77 m, p90 310 m and up to 2,309 m on a Riyadh sample.

The category list lives in `api/services.py` and is short on purpose -- see that
module for the coverage measurements that decided it, and for why there is no
composite score.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Final

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd

# `api/services.py` holds the category table and the distance primitives so this
# script and the estimate endpoint share one definition. The project root goes
# on the path because scripts run from `scripts/`, which does not otherwise see
# it.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.services import (  # noqa: E402
    CATEGORIES,
    METRIC_CRS,
    MOSQUE_CLASSES,
    RADII_M,
    Category,
    counts_within,
    nearest_distances,
)

# Saudi bounding box. 16 of the 781,398 listings fall outside it and are dropped.
SAUDI_BBOX: Final[tuple[float, float, float, float]] = (16.0, 33.0, 34.0, 56.0)

MIN_LISTINGS_FOR_DISTRICT_STATS: Final[int] = 10

# Listings are processed in blocks. `sjoin` against a buffered geometry
# materialises one row per (listing, feature) pair, so a 2 km buffer over all
# 781K listings at once builds a frame large enough to exhaust memory.
CHUNK_SIZE: Final[int] = 50_000


def load_layer(shp_dir: Path, layer: str) -> gpd.GeoDataFrame:
    """Read one Geofabrik shapefile layer, keeping only class and geometry."""
    path = shp_dir / f"{layer}.shp"
    if not path.exists():
        raise FileNotFoundError(
            f"missing shapefile layer {path}. Unzip gcc-states-free.shp.zip into {shp_dir}"
        )
    return gpd.read_file(path, columns=["fclass", "geometry"])


def category_features(
    points: gpd.GeoDataFrame,
    areas: gpd.GeoDataFrame,
    worship_points: gpd.GeoDataFrame,
    worship_areas: gpd.GeoDataFrame,
    category: Category,
) -> gpd.GeoDataFrame:
    """Every feature belonging to one category, projected and geometry intact."""
    if category.from_places_of_worship:
        selected_points = worship_points[worship_points["fclass"].isin(MOSQUE_CLASSES)]
        selected_areas = worship_areas[worship_areas["fclass"].isin(MOSQUE_CLASSES)]
    else:
        selected_points = points[points["fclass"].isin(category.point_classes)]
        selected_areas = areas[areas["fclass"].isin(category.area_classes)]

    combined = pd.concat(
        [selected_points.geometry, selected_areas.geometry], ignore_index=True
    )
    frame = gpd.GeoDataFrame(geometry=combined, crs=points.crs).to_crs(METRIC_CRS)
    return frame[frame.geometry.notna() & ~frame.geometry.is_empty].reset_index(drop=True)


def load_listings(source_parquet: Path) -> pd.DataFrame:
    """Read listing id, coordinates, city and district, clipped to the bbox."""
    lat_min, lat_max, lng_min, lng_max = SAUDI_BBOX
    return duckdb.connect().sql(
        f"""
        SELECT id,
               "location.lat" AS lat,
               "location.lng" AS lng,
               city, district, price, area, estate_type, estate_benefit
        FROM read_parquet('{source_parquet}')
        WHERE "location.lat" BETWEEN {lat_min} AND {lat_max}
          AND "location.lng" BETWEEN {lng_min} AND {lng_max}
        ORDER BY id
        """
    ).df()


def enrich(listings: pd.DataFrame, shp_dir: Path, features_output: Path) -> pd.DataFrame:
    """Nearest distance and radius counts per listing, per category.

    Also writes every kept feature to `features_output` as GeoParquet. The API
    scores arbitrary points -- a pin the user drops -- and needs the same
    geometries, without re-reading the 476 MB shapefile bundle at startup.
    """
    points = load_layer(shp_dir, "gis_osm_pois_free_1")
    areas = load_layer(shp_dir, "gis_osm_pois_a_free_1")
    worship_points = load_layer(shp_dir, "gis_osm_pofw_free_1")
    worship_areas = load_layer(shp_dir, "gis_osm_pofw_a_free_1")

    projected_listings = gpd.GeoDataFrame(
        listings[["id"]],
        geometry=gpd.points_from_xy(listings["lng"], listings["lat"]),
        crs="EPSG:4326",
    ).to_crs(METRIC_CRS)

    result = listings.copy()
    saved: list[gpd.GeoDataFrame] = []

    for category in CATEGORIES:
        features = category_features(points, areas, worship_points, worship_areas, category)
        if len(features) == 0:
            raise ValueError(
                f"category '{category.key}' matched no features. Check its fclass lists "
                f"against the layer vocabulary -- an empty category would silently "
                f"report every listing as infinitely far from it."
            )

        distances = np.empty(len(projected_listings), dtype=np.float64)
        counts = {radius: np.empty(len(projected_listings), dtype=np.int32) for radius in RADII_M}

        for start in range(0, len(projected_listings), CHUNK_SIZE):
            chunk = projected_listings.iloc[start : start + CHUNK_SIZE]
            distances[start : start + len(chunk)] = nearest_distances(chunk, features).to_numpy()
            for radius in RADII_M:
                counts[radius][start : start + len(chunk)] = counts_within(
                    chunk, features, radius
                ).to_numpy()

        result[f"dist_{category.key}_m"] = np.round(distances, 1)
        for radius in RADII_M:
            result[f"count_{category.key}_{radius}m"] = counts[radius]

        labelled = features.copy()
        labelled["category"] = category.key
        saved.append(labelled)

        print(
            f"  {category.key:12} {len(features):6,} features  "
            f"median {np.median(distances):8,.0f} m",
            flush=True,
        )

    gpd.GeoDataFrame(pd.concat(saved, ignore_index=True), crs=METRIC_CRS).to_parquet(
        features_output
    )
    print(f"  wrote {features_output.name}", flush=True)
    return result


def aggregate_districts(enriched: pd.DataFrame) -> pd.DataFrame:
    """Per-neighborhood statistics, keyed on (city, district).

    The pair is the key, never the district name alone: this dataset holds 1,114
    distinct names across 1,979 distinct (city, district) pairs, so grouping by
    name merges unrelated neighborhoods in different cities.

    Districts below `MIN_LISTINGS_FOR_DISTRICT_STATS` get `sufficient = False`.
    The 10th-percentile district has three listings, and a median drawn from
    three listings presented as a neighborhood fact is noise.
    """
    with_ppm = enriched.assign(
        price_per_m2=np.where(
            enriched["area"] > 0, enriched["price"] / enriched["area"], np.nan
        )
    )

    aggregations: dict[str, tuple[str, str]] = {
        "listing_count": ("id", "count"),
        "median_price": ("price", "median"),
        "median_price_per_m2": ("price_per_m2", "median"),
    }
    for category in CATEGORIES:
        aggregations[f"mean_dist_{category.key}_m"] = (f"dist_{category.key}_m", "mean")

    districts = (
        with_ppm.groupby(["city", "district"], dropna=False).agg(**aggregations).reset_index()
    )
    districts["sufficient"] = districts["listing_count"] >= MIN_LISTINGS_FOR_DISTRICT_STATS

    numeric = districts.select_dtypes(include=[np.floating]).columns
    districts[numeric] = districts[numeric].round(1)
    return districts


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    source_parquet = (
        project_root.parent / "Saudi_REAL_ESTATE_PROJECT" / "data" / "real_estate_final.parquet"
    )
    shp_dir = project_root / "data_raw" / "shp"
    output_dir = project_root / "data_enriched"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"reading listings from {source_parquet}", flush=True)
    listings = load_listings(source_parquet)
    print(f"{len(listings):,} listings inside the Saudi bbox", flush=True)

    print("measuring distances to real geometry:", flush=True)
    enriched = enrich(listings, shp_dir, output_dir / "poi_features.parquet")

    listing_output = output_dir / "listing_pois.parquet"
    enriched.drop(
        columns=["lat", "lng", "city", "district", "price", "area",
                 "estate_type", "estate_benefit"]
    ).to_parquet(listing_output, compression="zstd", index=False)
    print(f"wrote {listing_output}", flush=True)

    districts = aggregate_districts(enriched)
    districts.to_parquet(output_dir / "districts.parquet", compression="zstd", index=False)
    print(
        f"wrote districts.parquet: {len(districts):,} (city, district) pairs, "
        f"{int(districts['sufficient'].sum()):,} with enough listings",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

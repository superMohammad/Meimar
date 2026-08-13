"""Derive district and city outlines from the listings themselves.

The price choropleth needs a shape per neighborhood. OSM cannot supply one:
only 129 of our 1,114 district names match an OSM place polygon, and the whole
GCC extract holds 522 suburb polygons. Matching Arabic place names across two
sources would be guesswork on top of a source that does not have the coverage
anyway.

A concave hull around a district's own listings avoids the problem entirely.
The outline is by construction aligned with the data it will be shaded by, and
needs no name matching. It traces where listings are, which is not exactly a
municipal boundary -- close enough to shade a neighborhood, wrong if anyone ever
needs a legal border.

Verified extents: حي الملقا 38 km2, حي النرجس 63 km2, حي الرمال 238 km2, which
match how those districts actually sprawl.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Final

import duckdb
import geopandas as gpd
import pandas as pd
from shapely import MultiPoint, concave_hull
from shapely.geometry.base import BaseGeometry

SAUDI_BBOX: Final[tuple[float, float, float, float]] = (16.0, 33.0, 34.0, 56.0)

# Below this a hull is a triangle through three arbitrary points, not an
# outline. The same floor the district statistics use.
MIN_LISTINGS: Final[int] = 10

# 1.0 is the convex hull; lower follows the points more tightly. 0.4 keeps
# sprawling districts from swallowing the desert between their edges without
# fraying into slivers.
HULL_RATIO: Final[float] = 0.4

# Roughly 130 m at these latitudes -- below what is visible at district zoom,
# and it cuts the payload by a third.
SIMPLIFY_DEGREES: Final[float] = 0.0012

# Hulls larger than this are not neighborhoods. In rural municipalities a
# handful of listings scatter across a whole region, and the hull around them
# reaches 15,660 km2 -- a shape that dominates the map while describing nothing.
# The median real district is 4 km2 and even sprawling حي الرمال is 238, so this
# ceiling drops about 9% of outlines, all of them the wrong kind of shape.
MAX_AREA_KM2: Final[float] = 300.0

# Web Mercator, only to measure area for the ceiling above. Its distortion is
# irrelevant to a threshold this coarse.
AREA_CRS: Final[str] = "EPSG:3857"


def load_points(source_parquet: Path) -> pd.DataFrame:
    """Listing coordinates with their city and district."""
    lat_min, lat_max, lng_min, lng_max = SAUDI_BBOX
    return duckdb.connect().sql(
        f"""
        SELECT city, district,
               "location.lat" AS lat,
               "location.lng" AS lng
        FROM read_parquet('{source_parquet}')
        WHERE "location.lat" BETWEEN {lat_min} AND {lat_max}
          AND "location.lng" BETWEEN {lng_min} AND {lng_max}
          AND city IS NOT NULL AND district IS NOT NULL
        """
    ).df()


def hull_of(frame: pd.DataFrame) -> BaseGeometry | None:
    """Concave hull around one group's points, or None if it cannot form one."""
    if len(frame) < MIN_LISTINGS:
        return None
    hull = concave_hull(MultiPoint(list(zip(frame["lng"], frame["lat"]))), ratio=HULL_RATIO)
    if hull.is_empty or hull.geom_type not in ("Polygon", "MultiPolygon"):
        return None
    return hull


def build_outlines(points: pd.DataFrame, keys: list[str]) -> gpd.GeoDataFrame:
    """One hull per group, simplified."""
    rows = [
        {**dict(zip(keys, group if isinstance(group, tuple) else (group,))), "geometry": hull}
        for group, frame in points.groupby(keys, dropna=True)
        if (hull := hull_of(frame)) is not None
    ]
    outlines = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    outlines["geometry"] = outlines.geometry.simplify(SIMPLIFY_DEGREES)

    area_km2 = outlines.to_crs(AREA_CRS).geometry.area / 1e6
    return outlines[area_km2 <= MAX_AREA_KM2].reset_index(drop=True)


def write_geojson(outlines: gpd.GeoDataFrame, destination: Path) -> None:
    """Write GeoJSON with coordinates rounded to about a metre.

    GeoJSON writers emit full float precision by default, which is roughly a
    micrometre per coordinate and doubles the file for digits no one can see.
    """
    payload = json.loads(outlines.to_json())
    for feature in payload["features"]:
        feature.pop("id", None)
        feature["geometry"] = json.loads(
            json.dumps(feature["geometry"]),
            parse_float=lambda value: round(float(value), 5),
        )
    destination.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                           encoding="utf-8")


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    source_parquet = (
        project_root.parent / "Saudi_REAL_ESTATE_PROJECT" / "data" / "real_estate_final.parquet"
    )
    output_dir = project_root / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    points = load_points(source_parquet)
    print(f"{len(points):,} located listings", flush=True)

    # Districts only. City outlines were built too and dropped: a city hull is
    # legitimately hundreds of square kilometres, so the area ceiling that
    # removes runaway rural districts also removes almost every city, leaving an
    # arbitrary dozen. A city tier needs its own ceiling, and nothing asks for
    # one yet.
    outlines = build_outlines(points, ["city", "district"])
    destination = output_dir / "districts.geojson"
    write_geojson(outlines, destination)
    print(
        f"wrote {destination.name}: {len(outlines):,} outlines, "
        f"{destination.stat().st_size / 1e6:.2f} MB",
        flush=True,
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())

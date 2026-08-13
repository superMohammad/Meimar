"""Nearby-amenity distances: the category table, and lookup for a point.

This module is the single definition. Both sides import it: `scripts/enrich_pois.py`
scores all 781K listings offline, and the estimate endpoint scores an arbitrary
point the user drops on the map. Two copies would drift, and a listing's stored
distances would stop matching what the API returns for the same coordinates.

It depends only on geopandas and shapely, so the serving venv does not inherit
the GPU stack and the offline venv does not inherit FastAPI.

Two decisions here were forced by measurement, not preference.

**Distance is to the real geometry, not to a centroid.** Reducing a park polygon
to `representative_point()` measured to its middle rather than its edge, which
overstated distance by a median of 77 m, p90 310 m and up to 2,309 m on a Riyadh
sample -- the reason a listing facing a park reported one 2 km away.

**Only four categories survive.** Measured against plausible urban reality, OSM
maps landmarks well and everyday density badly:

    mosque      480 m vs ~300 m    kept
    hospital  2,195 m vs ~1-2 km   kept
    mall      3,189 m vs ~3 km     kept
    university 4,672 m vs ~5 km    kept
    park      1,152 m vs ~400 m    dropped, 3x
    school    1,521 m vs ~500 m    dropped, 3x
    supermarket 1,256 m vs ~300 m  dropped, 4x
    cafe      1,691 m vs ~500 m    dropped, 3x
    gym       2,803 m vs ~1 km     dropped, 3x

The dropped ones are the categories users care most about. Restoring them needs
a source with real coverage, not more code here. There is deliberately no
composite 0-100 score: a weighted mean over categories of uneven quality is one
confident number that the data does not support.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

import geopandas as gpd
import pandas as pd

# Web Mercator. Distances are metric and, at Saudi latitudes, inflated by about
# 10% -- acceptable for "how far is the nearest hospital", and far cheaper than
# reprojecting per city. Use a local UTM zone if these ever need survey accuracy.
METRIC_CRS: Final[str] = "EPSG:3857"

RADII_M: Final[tuple[int, int, int]] = (500, 1000, 2000)


@dataclass(frozen=True)
class Category:
    """One amenity category and the OSM classes that make it up."""

    key: str
    point_classes: tuple[str, ...]
    area_classes: tuple[str, ...]
    from_places_of_worship: bool


CATEGORIES: Final[tuple[Category, ...]] = (
    Category("mosque", (), (), True),
    Category("hospital", ("hospital", "clinic", "doctors"), ("hospital", "clinic", "doctors"), False),
    Category("mall", ("mall", "department_store"), ("mall", "department_store"), False),
    Category("university", ("university", "college"), ("university", "college"), False),
)

# Geofabrik files mosques under the places-of-worship layers, split by branch.
MOSQUE_CLASSES: Final[tuple[str, ...]] = ("muslim", "muslim_sunni", "muslim_shia")


def nearest_distances(
    targets: gpd.GeoDataFrame, features: gpd.GeoDataFrame
) -> pd.Series:
    """Metres from each target to the nearest feature's actual geometry.

    `sjoin_nearest` can return several rows for one target when distances tie,
    so the result is reduced back to one row per target.
    """
    joined = gpd.sjoin_nearest(targets[["geometry"]], features[["geometry"]], distance_col="_d")
    return joined["_d"].groupby(level=0).min()


def counts_within(
    targets: gpd.GeoDataFrame, features: gpd.GeoDataFrame, radius_m: int
) -> pd.Series:
    """How many features lie within `radius_m` of each target.

    Counts the features intersecting a buffer around each target, so a large
    park counts when any part of it is in range -- consistent with the distance
    above, which is also measured to the nearest part.
    """
    buffered = targets[["geometry"]].copy()
    buffered["geometry"] = buffered.geometry.buffer(radius_m)
    joined = gpd.sjoin(buffered, features[["geometry"]], predicate="intersects")
    return joined.groupby(level=0).size().reindex(targets.index, fill_value=0)


class ServicesIndex:
    """Amenity lookup for arbitrary coordinates.

    A class because it owns the projected feature frames for the process
    lifetime. They are read from the GeoParquet `scripts/enrich_pois.py` writes
    -- a few tens of thousands of geometries -- rather than from the 476 MB
    Geofabrik bundle.
    """

    def __init__(self, features_path: Path) -> None:
        if not features_path.exists():
            raise FileNotFoundError(
                f"{features_path} not found. Run scripts/enrich_pois.py to generate it."
            )
        features = gpd.read_parquet(features_path)
        self._by_category: dict[str, gpd.GeoDataFrame] = {
            category.key: features[features["category"] == category.key].reset_index(drop=True)
            for category in CATEGORIES
        }

    def describe_point(self, lat: float, lng: float) -> list[dict[str, float]]:
        """Nearest distance and radius counts per category for one point."""
        point = gpd.GeoDataFrame(
            geometry=gpd.points_from_xy([lng], [lat]), crs="EPSG:4326"
        ).to_crs(METRIC_CRS)

        described: list[dict[str, float]] = []
        for category in CATEGORIES:
            features = self._by_category[category.key]
            distance = float(nearest_distances(point, features).iloc[0])
            counts = {
                f"count_{radius}m": int(counts_within(point, features, radius).iloc[0])
                for radius in RADII_M
            }
            described.append(
                {"category": category.key, "distance_m": round(distance, 1), **counts}
            )
        return described

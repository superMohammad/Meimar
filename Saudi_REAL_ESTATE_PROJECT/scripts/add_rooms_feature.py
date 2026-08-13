"""Combine bedrooms and living rooms into a single `rooms` count.

`rooms = beds + livings`. Verified against 378 listings that enumerate their
own rooms in the ad text: the sum undercounts the true total by 2.4 rooms on
average (MAE 2.56) but never double-counts, because the stored `beds` and
`livings` columns measure disjoint things. The shortfall is majlis (مجلس) and
maqlat (مقلط), which no column in this dataset records.

Driver rooms need no exclusion -- they were never part of `beds` or `livings`;
`f_driver` tracks them separately as a flag.

`beds` and `livings` are kept alongside `rooms`. A 5-bed/1-living villa and a
3-bed/3-living villa both total 8 but are different properties, and dropping
the parts throws that away for no gain. Remove them at the modelling step if a
single column is genuinely wanted.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

SOURCE = Path("data/real_estate_model_ready.parquet")
OUTPUT = Path("data/real_estate_model_ready.parquet")


def add_rooms(frame: pd.DataFrame) -> pd.DataFrame:
    """Return a new frame carrying `rooms` and its applicability flag.

    Null in either part yields a null total: a property with 3 bedrooms and an
    unknown number of living rooms has an unknown room count, and coercing the
    unknown part to zero would silently understate it.
    """
    result = frame.copy()
    result["rooms"] = result["beds"] + result["livings"]
    # Not applicable only where both parts are inapplicable (land, farm, ...).
    result["rooms_na"] = result["beds_na"] & result["livings_na"]
    return result


def main() -> None:
    frame = pd.read_parquet(SOURCE)
    result = add_rooms(frame)

    if len(result) != len(frame):
        raise ValueError(f"row count changed: {len(frame)} -> {len(result)}")

    rooms = result["rooms"]
    print(f"{len(result):,} rows x {len(result.columns)} columns -> {OUTPUT}\n")
    print(f"rooms non-null : {rooms.notna().sum():>9,}  ({rooms.notna().mean() * 100:.1f}%)")
    print(f"rooms null     : {rooms.isna().sum():>9,}  (beds or livings unknown)")
    print(f"rooms_na=True  : {int(result['rooms_na'].sum()):>9,}  (property type has no rooms)")
    print()
    print("distribution of rooms where the property actually has rooms:")
    print(rooms[~result["rooms_na"]].describe().round(2).to_string())

    result.to_parquet(OUTPUT, index=False)


if __name__ == "__main__":
    main()

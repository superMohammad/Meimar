"""Recover the three tractable groups of remaining nulls.

1. Extend the structural map for `beds`. The notebook exempted a type only when
   it was >97% null; building (94%), store (97%), room (93%) and office (82%)
   fell just under and were left in. Shops and apartment blocks do not have
   bedrooms, and their sparse non-null values cluster on 1, which reads as a
   form default rather than data.

2. Treat `street_width` as structural for apartment and floor. An apartment is
   inside a building and has no street frontage of its own -- 25% and 28% null
   respectively, against 1% for villas.

3. Fill `rooms` from the LLM extraction where available. Those 19,125 values
   were validated at 0.858 exact / 0.971 within +/-1 and count majlis, maqlat
   and maid rooms, which `beds + livings` cannot see. They land in `rooms`
   rather than `beds` because they measure the total, not the bedroom count.

`rooms` is recomputed after step 1 so the new zeros propagate, then overwritten
by the extracted totals where those exist.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

DATASET = Path("data/real_estate_model_ready.parquet")
EXTRACTIONS = Path("data/llm_extractions")

BEDS_EXEMPT_TYPES: tuple[str, ...] = ("building", "store", "room", "office")
STREET_WIDTH_EXEMPT_TYPES: tuple[str, ...] = ("apartment", "floor")


def extend_structural(frame: pd.DataFrame) -> pd.DataFrame:
    """Zero-fill and flag the two field/type combinations found to be structural."""
    result = frame.copy()
    estate_type = result["estate_type"].astype(str)

    beds_na = estate_type.isin(BEDS_EXEMPT_TYPES)
    result["beds_na"] = result["beds_na"] | beds_na
    result.loc[beds_na & result["beds"].isna(), "beds"] = 0

    width_na = estate_type.isin(STREET_WIDTH_EXEMPT_TYPES)
    result["street_width_na"] = width_na
    result.loc[width_na & result["street_width"].isna(), "street_width"] = 0

    return result


def recompute_rooms(frame: pd.DataFrame) -> pd.DataFrame:
    """Rebuild `rooms` from its parts so the new zeros are reflected."""
    result = frame.copy()
    result["rooms"] = result["beds"] + result["livings"]
    result["rooms_na"] = result["beds_na"] & result["livings_na"]
    return result


def load_extracted_rooms() -> pd.DataFrame:
    """Grounded room totals accepted by the validation gate."""
    pattern = str(EXTRACTIONS / "part_*.parquet")
    return duckdb.sql(
        f"""
        SELECT id, rooms_value AS extracted_rooms
        FROM read_parquet('{pattern}', union_by_name = true)
        WHERE rooms_status IN ('accepted', 'accepted_fuzzy')
          AND rooms_value IS NOT NULL
        """
    ).df()


def apply_extracted_rooms(frame: pd.DataFrame, extracted: pd.DataFrame) -> pd.DataFrame:
    """Prefer the extracted total wherever `rooms` could not be derived."""
    result = frame.merge(extracted, on="id", how="left")
    fill = result["rooms"].isna() & result["extracted_rooms"].notna()
    result.loc[fill, "rooms"] = result.loc[fill, "extracted_rooms"]
    result = result.drop(columns=["extracted_rooms"])
    return result, int(fill.sum())


def main() -> None:
    frame = pd.read_parquet(DATASET)
    before = {c: int(frame[c].isna().sum()) for c in ("beds", "street_width", "rooms")}

    frame = extend_structural(frame)
    frame = recompute_rooms(frame)
    frame, rooms_filled = apply_extracted_rooms(frame, load_extracted_rooms())

    if len(frame) != 810888:
        raise ValueError(f"row count changed: {len(frame)}")

    print(f"{len(frame):,} rows x {len(frame.columns)} columns\n")
    header = f"{'column':<14}{'nulls before':>14}{'nulls after':>13}{'recovered':>11}"
    print(header)
    print("-" * len(header))
    for column in ("beds", "street_width", "rooms"):
        after = int(frame[column].isna().sum())
        print(f"{column:<14}{before[column]:>14,}{after:>13,}{before[column] - after:>11,}")
    print(f"\nrooms filled from validated LLM extraction: {rooms_filled:,}")

    frame.to_parquet(DATASET, index=False)


if __name__ == "__main__":
    main()

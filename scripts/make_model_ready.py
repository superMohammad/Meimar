"""Produce the model-ready dataset.

Two steps, in order:

1. Drop the pipeline's bookkeeping columns, returning to the original cleaned
   schema. The extracted values that belong in existing columns (livings, wc,
   age, street_width) were already written into them and are kept.

2. Fill structurally-inapplicable cells with 0 and flag them. A plot of land
   genuinely has zero bedrooms, so 0 is the truthful value -- but 0 is also a
   meaningful value in these columns already (age=0 means "new build" for
   331,941 rows), so each filled cell carries a `{field}_na` flag. Without it a
   model cannot tell "empty plot" from "newly built villa".

Only structural nulls are filled. Cells that are genuinely missing -- the field
applies but nobody stated it -- stay null, because inventing values there would
be guessing.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

SOURCE = Path("data/real_estate_working.parquet")
REFERENCE = Path("data/real_estate_clean_BACKUP.parquet")
OUTPUT = Path("data/real_estate_model_ready.parquet")

FIELDS: tuple[str, ...] = ("beds", "livings", "wc", "age", "furnished")

# Ported from notebook/EDA.ipynb: a field listed for a property type is >97%
# null for that type because it is meaningless there.
STRUCTURAL: dict[str, tuple[str, ...]] = {
    "land": ("beds", "livings", "wc", "furnished", "age"),
    "building": ("livings", "wc"),
    "store": ("livings", "wc", "furnished"),
    "esterahah": ("furnished",),
    "room": ("livings", "wc"),
    "office": ("livings", "wc"),
    "farm": ("beds", "livings", "wc", "furnished"),
    "warehouse": ("livings", "wc", "furnished"),
    "chalet": ("furnished",),
    "campsite": ("beds", "livings", "wc", "furnished", "age", "street_width"),
}


def exempt_types(field: str) -> list[str]:
    """Property types for which `field` carries no meaning."""
    return [etype for etype, cols in STRUCTURAL.items() if field in cols]


def build_model_ready(working: pd.DataFrame, original_columns: list[str]) -> pd.DataFrame:
    """Return a new frame: original schema, structural nulls zeroed and flagged."""
    frame = working[original_columns].copy()
    estate_type = frame["estate_type"].astype(str)

    for field in FIELDS:
        not_applicable = estate_type.isin(exempt_types(field))
        frame[f"{field}_na"] = not_applicable
        frame.loc[not_applicable & frame[field].isna(), field] = 0

    return frame


def main() -> None:
    working = pd.read_parquet(SOURCE)
    original_columns = list(pd.read_parquet(REFERENCE).columns)

    before = {f: int(working[f].isna().sum()) for f in FIELDS}
    frame = build_model_ready(working, original_columns)

    if len(frame) != len(working):
        raise ValueError(f"row count changed: {len(working)} -> {len(frame)}")

    print(f"{len(frame):,} rows x {len(frame.columns)} columns -> {OUTPUT}\n")
    header = f"{'field':<11}{'nulls before':>14}{'zero-filled':>13}{'nulls left':>12}"
    print(header)
    print("-" * len(header))
    for field in FIELDS:
        left = int(frame[field].isna().sum())
        print(f"{field:<11}{before[field]:>14,}{before[field] - left:>13,}{left:>12,}")

    frame.to_parquet(OUTPUT, index=False)


if __name__ == "__main__":
    main()

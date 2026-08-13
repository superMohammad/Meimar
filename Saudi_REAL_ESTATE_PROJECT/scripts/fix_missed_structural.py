"""Close two structural exemptions that were missed.

1. `campsite.street_width` -- the notebook's STRUCTURAL map already listed this,
   but the first fill pass iterated only over beds/livings/wc/age/furnished, so
   street_width never had its exemptions applied. 407 of 408 campsites null.

2. `warehouse.beds` -- excluded originally because 93.4% sat under the notebook's
   97% bar, but building (94.1%), store (97.0%), room (93.3%) and office (81.6%)
   were all exempted once that bar was relaxed. Leaving warehouse in was
   arbitrary rather than principled; a warehouse has no bedrooms.

Deliberately NOT applied: farm.age (81.8%) and floor.furnished (59.8%). A farm
usually has a building, and that building has a real age; floors are routinely
rented furnished. Those nulls mean "not stated", not "not applicable", and
zeroing them would assert something the data does not support.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATASET = Path("data/real_estate_final.parquet")

# (column, flag column, property types the field does not apply to)
MISSED_EXEMPTIONS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("street_width", "street_width_na", ("campsite",)),
    ("beds", "beds_na", ("warehouse",)),
)


def apply_exemptions(frame: pd.DataFrame) -> pd.DataFrame:
    """Zero-fill and flag the missed field/type combinations."""
    result = frame.copy()
    estate_type = result["estate_type"].astype(str)

    for column, flag, types in MISSED_EXEMPTIONS:
        not_applicable = estate_type.isin(types)
        result[flag] = result[flag] | not_applicable
        result.loc[not_applicable & result[column].isna(), column] = 0

    return result


def main() -> None:
    frame = pd.read_parquet(DATASET)
    before = {c: int(frame[c].isna().sum()) for c, _, _ in MISSED_EXEMPTIONS}

    result = apply_exemptions(frame)

    if len(result) != len(frame):
        raise ValueError(f"row count changed: {len(frame)} -> {len(result)}")

    # `rooms` derives from beds, so newly zeroed bedrooms make more totals computable.
    result["rooms"] = result["rooms"].fillna(result["beds"] + result["livings"])

    header = f"{'column':<15}{'nulls before':>14}{'nulls after':>13}{'filled':>9}"
    print(f"{len(result):,} rows x {len(result.columns)} columns\n")
    print(header)
    print("-" * len(header))
    for column, _, _ in MISSED_EXEMPTIONS:
        after = int(result[column].isna().sum())
        print(f"{column:<15}{before[column]:>14,}{after:>13,}{before[column] - after:>9,}")

    result.to_parquet(DATASET, index=False)


if __name__ == "__main__":
    main()

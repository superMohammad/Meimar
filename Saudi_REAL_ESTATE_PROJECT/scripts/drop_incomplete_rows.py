"""Drop rows whose `livings` or `wc` could not be resolved.

What remains after structural zero-filling and extraction is genuinely missing:
the field applies to the property, but neither the listing form nor the ad text
states it. The extracted candidates that did exist for villas and floors were
withheld because accuracy there measured 0.214-0.475, too low to fill with.

Removing the rows rather than imputing keeps both columns honest -- every value
in them is either seller-provided or grounded in quoted text.

Written to a new file; the input is left intact.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

SOURCE = Path("data/real_estate_model_ready.parquet")
OUTPUT = Path("data/real_estate_final.parquet")

REQUIRED: tuple[str, ...] = ("livings", "wc")


def drop_incomplete(frame: pd.DataFrame) -> pd.DataFrame:
    """Return only rows where every required column carries a value."""
    complete = frame[list(REQUIRED)].notna().all(axis=1)
    return frame.loc[complete].reset_index(drop=True)


def main() -> None:
    frame = pd.read_parquet(SOURCE)
    result = drop_incomplete(frame)

    removed = len(frame) - len(result)
    print(f"rows {len(frame):,} -> {len(result):,}   (dropped {removed:,}, {100 * removed / len(frame):.1f}%)")
    print(f"columns: {len(result.columns)}\n")

    remaining = result.isna().sum()
    remaining = remaining[remaining > 0].sort_values(ascending=False)
    if remaining.empty:
        print("no nulls remain in any column")
    else:
        print("nulls remaining:")
        for column, count in remaining.items():
            print(f"  {column:<16}{count:>9,}  ({100 * count / len(result):.1f}%)")

    result.to_parquet(OUTPUT, index=False)
    print(f"\nwrote {OUTPUT}")


if __name__ == "__main__":
    main()

"""Merging verified extractions back into the dataset.

Two invariants hold here: an existing non-null source value is never
overwritten, and a field that failed its accuracy gate is never auto-filled --
it is marked for human review instead. Both are visible in the per-field audit
column rather than being implied.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from llm_fill.eval_harness import STRUCTURAL
from llm_fill.schemas import value_key
from llm_fill.types import ALL_TARGETS, NEW_COLUMNS, FieldStatus, TargetField

# Measured accuracy varies by property type, so trust is granted per
# (field, estate_type) rather than per field. A villa spans several floors plus
# an annex, so "how many bathrooms" has no single defensible answer and the
# stored labels disagree; an apartment is one unit with one answer. Filling
# these fields for villas would bury 4-in-5 wrong values among the good ones.
#
# Numbers are exact-match on the n=400 validation run:
#   wc       apartment 0.851  |  villa 0.214  |  floor 0.500
#   livings  apartment 0.888  |  villa 0.475  |  floor 0.750
#   age      apartment 0.862  |  villa 0.800
# None means the field cleared its gate across all property types:
#   rooms 0.858, driver_room F1 0.993, street_width 0.900 (land 0.929/villa 0.863)
TRUSTED_ESTATE_TYPES: dict[TargetField, frozenset[str] | None] = {
    TargetField.ROOMS: None,
    TargetField.DRIVER_ROOM: None,
    TargetField.STREET_WIDTH: None,
    TargetField.LIVINGS: frozenset({"apartment"}),
    TargetField.WC: frozenset({"apartment"}),
    TargetField.AGE: frozenset({"apartment"}),
    TargetField.FURNISHED: frozenset(),
}

STATUS_ORIGINAL = "original"
STATUS_LLM_FILLED = "llm_filled"
STATUS_STRUCTURAL = "not_attempted_structural_exempt"
STATUS_NEEDS_REVIEW = "needs_human_review"
STATUS_NOT_ATTEMPTED = "not_attempted"


def load_extractions(checkpoint_dir: Path) -> pd.DataFrame:
    """Read every checkpoint part into one frame, newest write per id winning."""
    parts = sorted(checkpoint_dir.glob("part_*.parquet"))
    if not parts:
        raise FileNotFoundError(f"no checkpoint parts under {checkpoint_dir}")
    frame = pd.concat((pd.read_parquet(p) for p in parts), ignore_index=True)
    return frame.sort_values("extracted_at").drop_duplicates("id", keep="last")


def _status_column(
    source: pd.DataFrame,
    original: pd.Series,
    extractions: pd.DataFrame,
    field: TargetField,
    fill_mask: pd.Series,
) -> pd.Series:
    """Audit trail for one field. `original` is all-null for created columns."""
    exempt_types = [e for e, cols in STRUCTURAL.items() if field.value in cols]
    status = pd.Series(STATUS_NOT_ATTEMPTED, index=source.index, dtype="object")

    status.loc[original.notna()] = STATUS_ORIGINAL
    status.loc[
        original.isna() & source["estate_type"].astype(str).isin(exempt_types)
    ] = STATUS_STRUCTURAL

    extracted_status = source["id"].map(
        extractions.set_index("id")[f"{field.value}_status"]
    )
    recorded = extracted_status.notna() & original.isna()
    status.loc[recorded] = "llm_" + extracted_status.loc[recorded].astype(str)
    status.loc[fill_mask] = STATUS_LLM_FILLED
    return status


def apply_extractions(
    source: pd.DataFrame,
    extractions: pd.DataFrame,
    trusted_fields: frozenset[TargetField],
) -> pd.DataFrame:
    """Return a new frame with gated, grounded values filled in.

    `trusted_fields` are those that cleared their accuracy gate. Anything else
    is recorded but left null and flagged for review.
    """
    merged = source.copy()
    accepted = {FieldStatus.ACCEPTED.value, FieldStatus.ACCEPTED_FUZZY.value}
    indexed = extractions.set_index("id")

    for field in ALL_TARGETS:
        column = field.value
        status_source = merged["id"].map(indexed[f"{column}_status"])
        values = merged["id"].map(indexed[value_key(field)])

        # `rooms` and `driver_room` are created by this pipeline, so there is
        # no prior column to preserve -- they start entirely null.
        if field in NEW_COLUMNS:
            dtype = "boolean" if field is TargetField.DRIVER_ROOM else "Int64"
            original = pd.Series(pd.NA, index=merged.index, dtype=dtype)
            merged[column] = original
        else:
            original = source[column]

        usable = original.isna() & status_source.isin(accepted) & values.notna()

        allowed_types = TRUSTED_ESTATE_TYPES[field]
        if allowed_types is None:
            type_ok = pd.Series(True, index=merged.index)
        else:
            type_ok = merged["estate_type"].astype(str).isin(allowed_types)

        if field in trusted_fields:
            fill_mask = usable & type_ok
            merged.loc[fill_mask, column] = values.loc[fill_mask].astype(
                merged[column].dtype
            )
        else:
            fill_mask = pd.Series(False, index=merged.index)

        status = _status_column(source, original, extractions, field, fill_mask)
        # A grounded value the gate refuses is withheld, not discarded: it stays
        # visible as review-worthy rather than silently vanishing.
        status.loc[usable & ~fill_mask] = STATUS_NEEDS_REVIEW
        merged[f"{column}_extraction_status"] = status

    return merged


def merge_to_file(
    checkpoint_path: Path,
    extraction_dir: Path,
    output_path: Path,
    trusted_fields: frozenset[TargetField],
) -> Path:
    """Write the filled dataset to a new file, never touching the inputs."""
    source = pd.read_parquet(checkpoint_path)
    extractions = load_extractions(extraction_dir)
    merged = apply_extractions(source, extractions, trusted_fields)

    if len(merged) != len(source):
        raise ValueError(
            f"row count changed during merge: {len(source)} -> {len(merged)}"
        )
    for field in ALL_TARGETS:
        if field in NEW_COLUMNS:
            continue
        original = source[field.value]
        result = merged[field.value]
        changed = original.notna() & (original != result)
        if bool(changed.any()):
            raise ValueError(
                f"merge overwrote {int(changed.sum())} existing {field.value} values"
            )

    merged.to_parquet(output_path, index=False)
    return output_path

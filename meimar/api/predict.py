"""Loading the persisted models and pricing a single property.

The models split `city` and `district` by category set membership, so the
integer code behind each name is part of the model. `scripts/train_models.py`
saves the exact vocabulary it fitted on; this module encodes against that saved
list and never re-derives it from the request. Re-deriving would renumber every
category and return confident nonsense rather than an error.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import numpy as np
import pandas as pd
import xgboost as xgb

CATEGORICAL_FEATURES: Final[tuple[str, ...]] = ("city", "district")

LAND_TYPE: Final[str] = "land"

# Each `<field>_missing` flag pairs with the field it describes.
#
# These are model features, and leaving them out is not neutral. Sent as NaN
# they cost roughly 40% of the predicted price -- a 1.10M SAR villa came back at
# 0.70M -- because the booster routes the missing value down a default direction
# learnt from rows where the flag was genuinely set. Supplying them brings the
# endpoint within about 1% of the precomputed estimate for the same property.
#
# The upstream pipeline sets the flag when a field does not apply to the property
# type and zero-fills the field itself, so that pairing is reproduced here: a
# value the caller did not give becomes 0 with its flag raised, never NaN.
MISSING_FLAGS: Final[dict[str, str]] = {
    "bedrooms_missing": "bedrooms",
    "bathrooms_missing": "bathrooms",
    "furnished_missing": "is_furnished",
    "street_width_missing": "street_width_m",
}


@dataclass(frozen=True)
class LoadedModel:
    """One market's booster and everything needed to feed and read it."""

    name: str
    booster: xgb.Booster
    features: tuple[str, ...]
    categories: dict[str, list[str]]
    per_square_metre: bool
    interval_low: float
    interval_high: float
    med_ape: float


def load_model(models_dir: Path, market: str) -> LoadedModel:
    """Read one market's booster and its metadata from disk."""
    booster_path = models_dir / f"{market}.ubj"
    meta_path = models_dir / f"{market}_meta.json"
    for path in (booster_path, meta_path):
        if not path.exists():
            raise FileNotFoundError(
                f"{path} not found. Run scripts/train_models.py to generate it."
            )

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    booster = xgb.Booster()
    booster.load_model(str(booster_path))
    # Fitted on a GPU, served on whatever the host has. Without this the
    # booster tries to predict on CUDA and fails on a CPU-only machine.
    booster.set_param({"device": "cpu"})

    return LoadedModel(
        name=market,
        booster=booster,
        features=tuple(meta["features"]),
        categories=meta["categories"],
        per_square_metre=bool(meta["per_square_metre"]),
        interval_low=float(meta["interval"]["low"]),
        interval_high=float(meta["interval"]["high"]),
        med_ape=float(meta["metrics"]["MedAPE%"]),
    )


def encode_category(value: str, vocabulary: list[str]) -> pd.Categorical:
    """Encode one categorical value against the fitted vocabulary.

    A value outside the vocabulary is replaced with None before construction,
    not passed through. Handing pandas an unseen category is deprecated and
    slated to raise; converting it to null here makes the intent explicit and
    gives XGBoost a missing value, which it routes down the split's default
    direction -- degraded but defined.
    """
    known = value if value in vocabulary else None
    return pd.Categorical([known], categories=vocabulary)


def build_feature_row(payload: dict[str, object], model: LoadedModel) -> pd.DataFrame:
    """Assemble the single-row frame the booster expects, in the fitted order.

    The frame must match how the training rows were built, not merely have the
    right column names -- see `MISSING_FLAGS` for what silently goes wrong
    otherwise.
    """
    row: dict[str, object] = {}

    for feature in model.features:
        if feature in CATEGORICAL_FEATURES:
            row[feature] = encode_category(
                str(payload.get(feature, "")), model.categories[feature]
            )
            continue

        if feature in MISSING_FLAGS:
            row[feature] = [1.0 if payload.get(MISSING_FLAGS[feature]) is None else 0.0]
            continue

        value = payload.get(feature)
        if value is None:
            # Zero-filled rather than NaN when the field has a companion flag,
            # matching the upstream pipeline: the flag carries "not stated", so
            # the value itself does not also have to.
            row[feature] = [0.0 if feature in MISSING_FLAGS.values() else np.nan]
        else:
            row[feature] = [float(value)]

    return pd.DataFrame(row, columns=list(model.features))


def is_unknown(value: str, vocabulary: list[str]) -> bool:
    return value not in vocabulary


def estimate_price(
    payload: dict[str, object], model: LoadedModel, area_m2: float
) -> tuple[float, float, float]:
    """Return (estimate, low, high) as total prices in SAR.

    The land model predicts price per square metre, so its output is multiplied
    by area here. This is the only place that inversion happens on the serving
    side, mirroring `to_total_price` in the training script.
    """
    features = build_feature_row(payload, model)
    matrix = xgb.DMatrix(features, enable_categorical=True)
    predicted_log = float(np.asarray(model.booster.predict(matrix)).ravel()[0])

    value = float(np.expm1(predicted_log))
    if model.per_square_metre:
        value *= area_m2

    return value, value * model.interval_low, value * model.interval_high


def market_for(estate_type: str) -> str:
    """Which model prices this property type."""
    return LAND_TYPE if estate_type == LAND_TYPE else "built"

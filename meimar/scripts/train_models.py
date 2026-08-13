"""Fit, persist and out-of-fold score the two sale-price models.

The recipe -- feature sets, bounds, targets and the hyperparameter grid -- comes
from `../Saudi_REAL_ESTATE_PROJECT/notebook/Modeling_Report.ipynb`, which
validated it at 9.9% median error on built property and 13.1% on land. That
notebook is the source of truth for those constants; this script exists because
the notebook persists nothing, so its boosters die with the kernel.

Two deliberate departures from the notebook:

1.  **The training frame is rebuilt from `real_estate_final.parquet` rather than
    read from `SELL_REAL_ESTATE_FOR_MODELING.parquet`.** That file carries no
    listing `id`, and without one a prediction cannot be attached to the listing
    it belongs to. Recovering ids by matching on (price, area, city, district,
    type, last_update) was tried and rejected: it matched 546,862 rows against
    533,399, so the key is not unique and the join would silently mis-assign
    prices. Rebuilding from source makes the id exact by construction. The row
    set may therefore differ slightly from the notebook's, which is why accuracy
    is re-measured here rather than quoted from it.

2.  **pandas throughout, with XGBoost on the GPU**, instead of cuDF. The serving
    endpoint builds a pandas frame, so training in pandas means one encoding
    path rather than two that have to agree.

Out-of-fold predictions are the point of the whole script. Predicting a listing
with a model that trained on it is an in-sample prediction sitting artificially
close to the asking price; precomputing that way would make most listings look
fairly priced purely because they were training rows. Each listing here is
predicted by a fold that never saw it.
"""

from __future__ import annotations

import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import duckdb
import numpy as np
import pandas as pd
import xgboost as xgb
from numpy.typing import NDArray

SEED: Final[int] = 42
SEARCH_ITERATIONS: Final[int] = 5
SEARCH_FOLDS: Final[int] = 3
OOF_FOLDS: Final[int] = 5

# The nine sale types the notebook models. Types outside this list (office,
# room, warehouse, chalet, campsite) are rental-dominated and were not modelled.
MODELLED_TYPES: Final[tuple[str, ...]] = (
    "apartment", "building", "esterahah", "farm", "floor",
    "house", "land", "store", "villa",
)

# Price bounds, from the notebook. They drop listings that are not real asks --
# a 1 SAR villa, a 10 billion SAR plot. Land is bounded on price per square
# metre instead of on price, since a large cheap plot and a small expensive one
# are both ordinary.
BUILT_PRICE_MIN: Final[int] = 50_000
BUILT_PRICE_MAX: Final[int] = 50_000_000
LAND_PRICE_MIN: Final[int] = 1_000
LAND_PPM_MIN: Final[float] = 10.0
LAND_PPM_MAX: Final[float] = 20_000.0

# A plot has no bedrooms, no kitchen and no furnishing, so the land model gets
# only the columns that carry signal on bare ground.
LAND_FEATURES: Final[tuple[str, ...]] = (
    "city", "district", "area_m2", "street_width_m",
    "is_corner", "is_investment", "near_masjid", "is_negotiable",
)

CATEGORICAL_FEATURES: Final[tuple[str, ...]] = ("city", "district")

# Source column -> model column. The model names are the notebook's.
COLUMN_MAP: Final[dict[str, str]] = {
    "beds": "bedrooms",
    "livings": "living_rooms",
    "wc": "bathrooms",
    "area": "area_m2",
    "street_width": "street_width_m",
    "furnished": "is_furnished",
    "f_ac": "has_ac",
    "f_parking": "has_parking",
    "f_pool": "has_pool",
    "f_kitchen": "has_kitchen",
    "f_driver": "has_driver_room",
    "f_basement": "has_basement",
    "f_garden": "has_garden",
    "f_two_entr": "has_two_entrances",
    "f_corner": "is_corner",
    "f_near_masjid": "near_masjid",
    "f_investment": "is_investment",
    "f_negotiable": "is_negotiable",
    "f_urgent": "is_urgent",
    "f_near_park": "near_park",
    "f_yard": "has_yard",
    "beds_na": "bedrooms_missing",
    "livings_na": "living_rooms_missing",
    "wc_na": "bathrooms_missing",
    "furnished_na": "furnished_missing",
    "street_width_na": "street_width_missing",
}

PARAM_GRID: Final[dict[str, list]] = {
    "n_estimators": [300, 500, 800, 1200],
    "learning_rate": [0.02, 0.03, 0.05],
    "max_depth": [4, 5, 6, 8],
    "min_child_weight": [10, 20, 50],
    "subsample": [0.7, 0.8],
    "colsample_bytree": [0.6, 0.8],
    "reg_lambda": [5, 20, 50],
}

# The empirical interval quoted to users: 80% of held-out listings fall between
# these quantiles of the true/predicted ratio.
INTERVAL_QUANTILES: Final[tuple[float, float]] = (0.1, 0.9)


@dataclass(frozen=True)
class Market:
    """One purpose-specific model: which rows it fits and what it predicts."""

    name: str
    # Land predicts price per square metre; built predicts price. Every land
    # number therefore has to be multiplied by area to become a price, which is
    # done in exactly one place -- `to_total_price`.
    per_square_metre: bool


BUILT = Market("built", per_square_metre=False)
LAND = Market("land", per_square_metre=True)


def booster_params(sampled: dict, seed: int) -> dict[str, object]:
    """Translate a sampled parameter set into native booster parameters.

    `max_cat_to_onehot: 1` keeps XGBoost on partition-based categorical splits,
    which is what makes `city` and `district` usable directly. It is also why
    these models cannot be converted to ONNX -- ONNX tree operators express only
    scalar comparisons, never set membership -- and therefore why predictions
    are precomputed here rather than run in the browser.
    """
    return {
        "device": "cuda",
        "tree_method": "hist",
        "max_cat_to_onehot": 1,
        "objective": "reg:squarederror",
        "eval_metric": "rmse",
        "eta": sampled["learning_rate"],
        "max_depth": sampled["max_depth"],
        "min_child_weight": sampled["min_child_weight"],
        "subsample": sampled["subsample"],
        "colsample_bytree": sampled["colsample_bytree"],
        "lambda": sampled["reg_lambda"],
        "seed": seed,
    }


def load_sale_listings(source_parquet: Path) -> pd.DataFrame:
    """Read sale listings with their ids and rename columns to model names."""
    source_columns = ", ".join(f'"{c}"' for c in COLUMN_MAP)
    types = ", ".join(f"'{t}'" for t in MODELLED_TYPES)

    frame = duckdb.connect().sql(
        f"""
        SELECT id, price, city, district, estate_type, {source_columns}
        FROM read_parquet('{source_parquet}')
        WHERE estate_benefit = 'sell'
          AND estate_type IN ({types})
          AND price > 0
          AND area > 0
        """
    ).df()

    frame = frame.rename(columns=COLUMN_MAP)
    for column in frame.columns:
        if frame[column].dtype == bool:
            frame[column] = frame[column].astype("int8")
    return frame


def split_markets(listings: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Apply the notebook's per-market bounds and return (built, land)."""
    is_land = listings["estate_type"] == "land"

    built = listings[~is_land]
    built = built[
        built["price"].between(BUILT_PRICE_MIN, BUILT_PRICE_MAX)
    ].reset_index(drop=True)

    land = listings[is_land]
    land = land[land["price"] >= LAND_PRICE_MIN]
    price_per_m2 = land["price"] / land["area_m2"]
    land = land[price_per_m2.between(LAND_PPM_MIN, LAND_PPM_MAX)].reset_index(drop=True)

    return built, land


def feature_frame(rows: pd.DataFrame, market: Market, categories: dict[str, list[str]]) -> pd.DataFrame:
    """Build the model matrix, with categoricals bound to a fixed vocabulary.

    The vocabulary is passed in and saved rather than inferred per call. Codes
    follow the order of `categories`, so a frame built from a different set of
    rows -- one listing at serve time, say -- still encodes `city` and
    `district` to the same integers the model was fitted on. Inferring the
    categories instead would renumber them and produce confident nonsense.
    """
    columns = (
        list(LAND_FEATURES)
        if market is LAND
        else [
            c
            for c in rows.columns
            if c not in ("id", "price", "estate_type", "living_rooms_missing")
        ]
    )

    features = rows[columns].copy()
    for column in CATEGORICAL_FEATURES:
        features[column] = pd.Categorical(features[column], categories=categories[column])
    return features


def build_categories(rows: pd.DataFrame) -> dict[str, list[str]]:
    """Fix the categorical vocabulary as the sorted unique values.

    Sorted because that is what `astype("category")` does, in both pandas and
    cuDF, so this reproduces the encoding the notebook fitted on.
    """
    return {
        column: sorted(rows[column].dropna().unique().tolist())
        for column in CATEGORICAL_FEATURES
    }


def target_of(rows: pd.DataFrame, market: Market) -> NDArray[np.float64]:
    """log1p of price, or of price per square metre for land."""
    raw = rows["price"] / rows["area_m2"] if market.per_square_metre else rows["price"]
    return np.log1p(raw.to_numpy(dtype=np.float64))


def to_total_price(
    predicted_log: NDArray[np.float64], rows: pd.DataFrame, market: Market
) -> NDArray[np.float64]:
    """Undo the log, and for land undo the per-square-metre target.

    The single place either inversion happens. Doing it in two places that drift
    apart is how a land estimate ends up off by a factor of its own area.
    """
    value = np.expm1(predicted_log)
    return value * rows["area_m2"].to_numpy(dtype=np.float64) if market.per_square_metre else value


def fit(features: pd.DataFrame, target: NDArray[np.float64], sampled: dict) -> xgb.Booster:
    """Fit one booster on the given rows."""
    matrix = xgb.QuantileDMatrix(features, target, enable_categorical=True)
    return xgb.train(
        booster_params(sampled, SEED), matrix, num_boost_round=sampled["n_estimators"]
    )


def predict(booster: xgb.Booster, features: pd.DataFrame) -> NDArray[np.float64]:
    matrix = xgb.DMatrix(features, enable_categorical=True)
    return np.asarray(booster.predict(matrix), dtype=np.float64).ravel()


def search_parameters(
    features: pd.DataFrame, target: NDArray[np.float64], rng_seed: int
) -> dict:
    """Random search scored by k-fold RMSE in log space, as the notebook does."""
    rng = random.Random(rng_seed)
    fold_id = np.random.RandomState(rng_seed).randint(0, SEARCH_FOLDS, size=len(features))

    best_rmse, best_params = np.inf, None
    for iteration in range(SEARCH_ITERATIONS):
        sampled = {key: rng.choice(values) for key, values in PARAM_GRID.items()}
        errors = []
        for fold in range(SEARCH_FOLDS):
            train, validate = fold_id != fold, fold_id == fold
            booster = fit(features[train], target[train], sampled)
            predicted = predict(booster, features[validate])
            errors.append(float(np.sqrt(np.mean((target[validate] - predicted) ** 2))))
        rmse = float(np.mean(errors))
        if rmse < best_rmse:
            best_rmse, best_params = rmse, sampled
        print(f"    [{iteration + 1}/{SEARCH_ITERATIONS}] rmse={rmse:.4f} best={best_rmse:.4f}",
              flush=True)

    if best_params is None:
        raise RuntimeError("parameter search produced no candidate")
    return best_params


def out_of_fold_predictions(
    features: pd.DataFrame, target: NDArray[np.float64], sampled: dict
) -> NDArray[np.float64]:
    """Predict every row with a booster that did not train on it."""
    fold_id = np.random.RandomState(SEED).randint(0, OOF_FOLDS, size=len(features))
    predicted = np.empty(len(features), dtype=np.float64)

    for fold in range(OOF_FOLDS):
        held_out = fold_id == fold
        booster = fit(features[~held_out], target[~held_out], sampled)
        predicted[held_out] = predict(booster, features[held_out])
        print(f"    fold {fold + 1}/{OOF_FOLDS} predicted {int(held_out.sum()):,} rows",
              flush=True)

    return predicted


def accuracy(true_price: NDArray[np.float64], predicted_price: NDArray[np.float64],
             true_log: NDArray[np.float64], predicted_log: NDArray[np.float64]) -> dict[str, float]:
    """Held-out accuracy, in the same measures the notebook reports."""
    ape = np.abs(predicted_price - true_price) / true_price
    residual = true_log - predicted_log
    return {
        "MedAPE%": round(float(np.median(ape) * 100), 2),
        "within_10%": round(float((ape <= 0.10).mean() * 100), 2),
        "R2_log": round(
            float(1 - np.sum(residual ** 2) / np.sum((true_log - true_log.mean()) ** 2)), 4
        ),
        "rows": int(len(true_price)),
    }


def run_market(rows: pd.DataFrame, market: Market, output_dir: Path) -> pd.DataFrame:
    """Search, out-of-fold score, refit on everything, and persist one market."""
    print(f"\n=== {market.name}: {len(rows):,} listings ===", flush=True)

    categories = build_categories(rows)
    features = feature_frame(rows, market, categories)
    target = target_of(rows, market)

    print("  searching parameters", flush=True)
    sampled = search_parameters(features, target, SEED)

    print("  out-of-fold predictions", flush=True)
    oof_log = out_of_fold_predictions(features, target, sampled)

    true_price = rows["price"].to_numpy(dtype=np.float64)
    oof_price = to_total_price(oof_log, rows, market)
    metrics = accuracy(true_price, oof_price, target, oof_log)
    print(f"  out-of-fold: {metrics}", flush=True)

    # The interval comes from held-out error, not from a distributional
    # assumption: 80% of out-of-fold listings land between these ratios.
    ratio = true_price / oof_price
    low_q, high_q = np.quantile(ratio, INTERVAL_QUANTILES)

    print("  refitting on all rows", flush=True)
    booster = fit(features, target, sampled)
    booster.save_model(str(output_dir / f"{market.name}.ubj"))

    (output_dir / f"{market.name}_meta.json").write_text(
        json.dumps(
            {
                "market": market.name,
                "per_square_metre": market.per_square_metre,
                "features": list(features.columns),
                "categories": categories,
                "params": {k: (v.item() if hasattr(v, "item") else v) for k, v in sampled.items()},
                "interval": {"low": float(low_q), "high": float(high_q)},
                "metrics": metrics,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    return pd.DataFrame(
        {
            "id": rows["id"].to_numpy(),
            "estimate": np.round(oof_price, 0),
            "estimate_low": np.round(oof_price * low_q, 0),
            "estimate_high": np.round(oof_price * high_q, 0),
            "estimate_market": market.name,
        }
    )


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    source_parquet = (
        project_root.parent / "Saudi_REAL_ESTATE_PROJECT" / "data" / "real_estate_final.parquet"
    )
    output_dir = project_root / "models"
    output_dir.mkdir(parents=True, exist_ok=True)

    listings = load_sale_listings(source_parquet)
    built, land = split_markets(listings)
    print(f"{len(listings):,} sale listings -> built {len(built):,}, land {len(land):,}")

    predictions = pd.concat(
        [run_market(built, BUILT, output_dir), run_market(land, LAND, output_dir)],
        ignore_index=True,
    )
    predictions.to_parquet(
        output_dir / "oof_predictions.parquet", compression="zstd", index=False
    )
    print(f"\nwrote {len(predictions):,} out-of-fold estimates", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Accuracy measurement against held-out ground truth.

The dataset supplies its own labels: rows where a target field is already
populated. Hiding that value, running the production extraction path over the
same text, and comparing gives a direct read on how far the pipeline can be
trusted -- before it is pointed at the 211,665 genuinely-missing cells.

Coverage and accuracy are reported separately on purpose. Many ads simply never
state a given attribute, so a null there is a correct answer, not a miss.
Blending the two would hide whichever one is failing.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import structlog

from llm_fill.pipeline import execute_tasks
from llm_fill.text import MIN_USABLE_LENGTH, normalize_content
from llm_fill.types import (
    ACCEPTED_STATUSES,
    OllamaConfig,
    RowTask,
    TargetField,
)

logger = structlog.get_logger(__name__)

# Ported verbatim from notebook/EDA.ipynb cell 75. A column listed for an
# estate type is >97% null for that type because it is meaningless there --
# land has no bedrooms. Those nulls are correct answers, not gaps, so they must
# be excluded from ground truth as well as from the work queue.
STRUCTURAL: dict[str, tuple[str, ...]] = {
    "land": ("rooms", "livings", "wc", "furnished", "age", "driver_room"),
    "building": ("livings", "wc"),
    "store": ("livings", "wc", "furnished", "driver_room"),
    "esterahah": ("furnished",),
    "room": ("livings", "wc"),
    "office": ("livings", "wc", "driver_room"),
    "farm": ("rooms", "livings", "wc", "furnished"),
    "warehouse": ("livings", "wc", "furnished", "driver_room"),
    "chalet": ("furnished",),
    "campsite": (
        "rooms",
        "livings",
        "wc",
        "furnished",
        "age",
        "street_width",
        "driver_room",
    ),
}

COUNT_EXACT_GATE = 0.85
COUNT_OFF_BY_ONE_GATE = 0.95
FURNISHED_PRECISION_GATE = 0.90
FURNISHED_F1_GATE = 0.85
STREET_WIDTH_TOLERANCE_GATE = 0.80
STREET_WIDTH_MAE_GATE = 5.0
STREET_WIDTH_TOLERANCE_METRES = 5.0

COUNT_FIELDS: frozenset[TargetField] = frozenset(
    {TargetField.ROOMS, TargetField.LIVINGS, TargetField.WC, TargetField.AGE}
)


@dataclass(frozen=True, slots=True)
class FieldMetrics:
    """Measured performance for one field on one sample."""

    field: TargetField
    sampled: int
    attempted: int
    coverage: float
    exact_match: float | None
    off_by_one: float | None
    mae: float | None
    within_tolerance: float | None
    precision: float | None
    recall: float | None
    f1: float | None
    rejected_ungrounded: int
    rejected_out_of_range: int
    retry_exhausted: int
    passed_gate: bool


def eligible_rows(frame: pd.DataFrame, field: TargetField) -> pd.DataFrame:
    """Rows usable as ground truth: value present, field meaningful, text usable."""
    exempt_types = [
        etype for etype, cols in STRUCTURAL.items() if field.value in cols
    ]
    mask = (
        frame[field.value].notna()
        & ~frame["estate_type"].astype(str).isin(exempt_types)
        & (frame["clean"].str.len() >= MIN_USABLE_LENGTH)
    )
    return frame.loc[mask]


def stratified_sample(
    frame: pd.DataFrame, sample_size: int, seed: int
) -> pd.DataFrame:
    """Sample proportionally across estate types.

    Without stratification the sample collapses onto apartments and villas, and
    the resulting accuracy would not describe the long tail of property types.
    """
    if len(frame) <= sample_size:
        return frame
    shares = frame["estate_type"].astype(str).value_counts(normalize=True)
    chunks: list[pd.DataFrame] = []
    for etype, share in shares.items():
        group = frame.loc[frame["estate_type"].astype(str) == etype]
        take = min(len(group), max(1, round(sample_size * float(share))))
        chunks.append(group.sample(n=take, random_state=seed))
    sampled = pd.concat(chunks)
    if len(sampled) > sample_size:
        sampled = sampled.sample(n=sample_size, random_state=seed)
    return sampled


def _f1(precision: float, recall: float) -> float:
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _score(
    field: TargetField,
    truth: list[float],
    predicted: list[float],
    sampled: int,
    rejected_ungrounded: int,
    rejected_out_of_range: int,
    retry_exhausted: int,
) -> FieldMetrics:
    attempted = len(predicted)
    coverage = attempted / sampled if sampled else 0.0

    exact = off_by_one = mae = within = precision = recall = f1 = None
    passed = False

    if attempted:
        if field is TargetField.FURNISHED:
            true_positive = sum(
                1 for t, p in zip(truth, predicted, strict=True) if p == 1 and t == 1
            )
            false_positive = sum(
                1 for t, p in zip(truth, predicted, strict=True) if p == 1 and t == 0
            )
            false_negative = sum(
                1 for t, p in zip(truth, predicted, strict=True) if p == 0 and t == 1
            )
            precision = (
                true_positive / (true_positive + false_positive)
                if (true_positive + false_positive)
                else 0.0
            )
            recall = (
                true_positive / (true_positive + false_negative)
                if (true_positive + false_negative)
                else 0.0
            )
            f1 = _f1(precision, recall)
            exact = sum(
                1 for t, p in zip(truth, predicted, strict=True) if t == p
            ) / attempted
            passed = precision >= FURNISHED_PRECISION_GATE and f1 >= FURNISHED_F1_GATE
        else:
            errors = [abs(t - p) for t, p in zip(truth, predicted, strict=True)]
            exact = sum(1 for e in errors if e == 0) / attempted
            off_by_one = sum(1 for e in errors if e <= 1) / attempted
            mae = sum(errors) / attempted
            within = sum(
                1 for e in errors if e <= STREET_WIDTH_TOLERANCE_METRES
            ) / attempted
            if field is TargetField.STREET_WIDTH:
                passed = (
                    within >= STREET_WIDTH_TOLERANCE_GATE and mae <= STREET_WIDTH_MAE_GATE
                )
            else:
                passed = (
                    exact >= COUNT_EXACT_GATE and off_by_one >= COUNT_OFF_BY_ONE_GATE
                )

    return FieldMetrics(
        field=field,
        sampled=sampled,
        attempted=attempted,
        coverage=coverage,
        exact_match=exact,
        off_by_one=off_by_one,
        mae=mae,
        within_tolerance=within,
        precision=precision,
        recall=recall,
        f1=f1,
        rejected_ungrounded=rejected_ungrounded,
        rejected_out_of_range=rejected_out_of_range,
        retry_exhausted=retry_exhausted,
        passed_gate=passed,
    )


async def evaluate_field(
    frame: pd.DataFrame,
    field: TargetField,
    sample_size: int,
    seed: int,
    config: OllamaConfig,
    concurrency: int,
) -> tuple[FieldMetrics, pd.DataFrame]:
    """Measure one field end to end. Returns metrics and the per-row detail."""
    population = eligible_rows(frame, field)
    if population.empty:
        raise ValueError(f"no ground-truth rows available for {field.value}")

    sample = stratified_sample(population, sample_size, seed)
    truth_by_id = {
        int(row.id): float(getattr(row, field.value))
        for row in sample.itertuples(index=False)
    }
    tasks = tuple(
        RowTask(
            row_id=int(row.id),
            clean_text=str(row.clean),
            needed=frozenset({field}),
        )
        for row in sample.itertuples(index=False)
    )

    truth: list[float] = []
    predicted: list[float] = []
    rejected_ungrounded = 0
    rejected_out_of_range = 0
    retry_exhausted = 0
    detail: list[dict[str, object]] = []

    async for result in execute_tasks(
        tasks=tasks,
        config=config,
        concurrency=concurrency,
        connection_error_limit=20,
    ):
        outcome = result.outcomes[0]
        actual = truth_by_id[result.row_id]
        status = outcome.status

        if status.value == "rejected_ungrounded":
            rejected_ungrounded += 1
        elif status.value == "rejected_out_of_range":
            rejected_out_of_range += 1
        elif status.value == "retry_exhausted":
            retry_exhausted += 1

        if status in ACCEPTED_STATUSES and outcome.value is not None:
            value = float(outcome.value)
            truth.append(actual)
            predicted.append(value)

        detail.append(
            {
                "id": result.row_id,
                "field": field.value,
                "actual": actual,
                "predicted": None if outcome.value is None else float(outcome.value),
                "status": status.value,
                "evidence": outcome.evidence,
                "latency_ms": result.latency_ms,
            }
        )

    metrics = _score(
        field=field,
        truth=truth,
        predicted=predicted,
        sampled=len(tasks),
        rejected_ungrounded=rejected_ungrounded,
        rejected_out_of_range=rejected_out_of_range,
        retry_exhausted=retry_exhausted,
    )
    return metrics, pd.DataFrame.from_records(detail)


def district_median_baseline(
    frame: pd.DataFrame, field: TargetField, sample_ids: frozenset[int]
) -> tuple[float, float, float]:
    """Accuracy of filling `field` from the district median, on the same rows.

    Medians are computed with the sampled rows excluded, so this is a genuine
    held-out comparison rather than the sample scoring itself. Returns
    (exact_match, mae, within_tolerance).
    """
    held_out = frame.loc[~frame["id"].isin(sample_ids)]
    medians = held_out.groupby("district_id")[field.value].median()
    global_median = float(held_out[field.value].median())

    sample = frame.loc[frame["id"].isin(sample_ids)]
    errors: list[float] = []
    for row in sample.itertuples(index=False):
        actual = getattr(row, field.value)
        if pd.isna(actual):
            continue
        predicted = medians.get(row.district_id, global_median)
        if pd.isna(predicted):
            predicted = global_median
        errors.append(abs(float(actual) - float(predicted)))

    if not errors:
        raise ValueError(f"no baseline rows for {field.value}")
    exact = sum(1 for e in errors if e == 0) / len(errors)
    mae = sum(errors) / len(errors)
    within = sum(1 for e in errors if e <= STREET_WIDTH_TOLERANCE_METRES) / len(errors)
    return exact, mae, within


# Some listings enumerate their rooms in a fixed template ("عدد المجالس : 3
# عدد الصالات : 2 عدد غرف النوم : 6"). Summing those counts yields ground truth
# for the ROOMS target that is derived from the listing text itself, which is
# the only reference available: no stored column holds this definition.
# Colon-anchored template fields only. Looser matching was tried and rejected:
# it silently mis-attributed numbers across categories ("وصاله 2 دورة مياه"
# read as two salas) and missed bedrooms written without the word نوم. A
# reference must be more reliable than the model it judges, so purity beats
# volume here.
ROOM_WORDS: dict[str, str] = {
    "majlis": r"(?:عدد\s*)?(?:ال)?مجالس\s*:",
    "salat": r"(?:عدد\s*)?(?:ال)?صالات\s*:",
    "bedrooms": r"(?:عدد\s*)?غرف\s*(?:ال)?نوم\s*:",
    "maqlat": r"(?:عدد\s*)?(?:ال)?(?:مقلط|ملقط|مجلط)\s*:",
}
# Room counts stated outside the template block (digit-before-word, e.g.
# "2مجلس", "4غرف") mean the template is not the whole story -- the model will
# count those too, so such listings cannot serve as reference.
FREEFORM_ROOMS = r"\d\s*(?:مجلس|مجالس|صاله|صالة|صالات|مقلط|ملقط|غرف|غرفه|غرفة)"
# Any master-bedroom mention disqualifies a listing: master rooms are normally
# a subset of the bedroom count, so neither adding nor ignoring them is safely
# correct. Matched loosely so variants are excluded rather than missed.
MASTER_PATTERN = r"ماستر|رئيسيه|رئيسية"
MAID_PATTERN = r"خادمه|خادمة|شغاله|شغالة"
# Template listings often print the field with an explicit negative or blank
# marker -- "غرفه خادمة ( لا )", "غرفة خادمة ( )" -- which means there is no
# maid room. Counting the mere mention would inflate every such reference row.
MAID_ABSENT = r"(?:خادمه|خادمة|شغاله|شغالة)\s*\S*\s*[\(:]\s*(?:لا|لايوجد|بدون)?\s*[\)]"


def _category_count(text: str, colon_pattern: str) -> int:
    """Sum one room category from its colon-anchored template field(s)."""
    return sum(int(n) for n in re.findall(rf"{colon_pattern}\s*(\d+)", text))


def template_rooms_ground_truth(frame: pd.DataFrame) -> pd.DataFrame:
    """Room totals for listings that enumerate rooms in the colon template.

    Kept deliberately narrow: the listing must declare bedrooms and salas in
    the template, must not mention master bedrooms (normally a subset of the
    bedroom count, so neither adding nor ignoring them is safe), and must not
    state further room counts in free text outside the template.
    """
    clean = frame["clean"]
    keep = (
        clean.str.contains(ROOM_WORDS["bedrooms"], regex=True)
        & clean.str.contains(ROOM_WORDS["salat"], regex=True)
        & ~clean.str.contains(MASTER_PATTERN, regex=True)
        & ~clean.str.contains(FREEFORM_ROOMS, regex=True)
    )
    working = frame.loc[keep].copy()

    totals = [
        sum(_category_count(text, p) for p in ROOM_WORDS.values())
        + int(
            bool(re.search(MAID_PATTERN, text))
            and not re.search(MAID_ABSENT, text)
        )
        for text in working["clean"]
    ]
    working["rooms_true"] = pd.Series(totals, index=working.index, dtype="Int64")
    return working.loc[working["rooms_true"] > 0, ["id", "clean", "rooms_true"]]


def load_ground_truth(checkpoint_path: Path) -> pd.DataFrame:
    """Load the cleaned dataset and rebuild `clean` exactly as the queue did."""
    frame = pd.read_parquet(checkpoint_path)
    frame = frame.copy()
    frame["clean"] = normalize_content(frame["content"])
    return frame


def run_evaluation(
    checkpoint_path: Path,
    fields: tuple[TargetField, ...],
    sample_size: int,
    seed: int,
    config: OllamaConfig,
    concurrency: int,
) -> tuple[tuple[FieldMetrics, ...], pd.DataFrame]:
    """Evaluate each field in turn and return metrics plus per-row detail."""
    frame = load_ground_truth(checkpoint_path)
    metrics: list[FieldMetrics] = []
    details: list[pd.DataFrame] = []
    for field in fields:
        field_metrics, detail = asyncio.run(
            evaluate_field(
                frame=frame,
                field=field,
                sample_size=sample_size,
                seed=seed,
                config=config,
                concurrency=concurrency,
            )
        )
        metrics.append(field_metrics)
        details.append(detail)
        logger.info(
            "field_evaluated",
            field=field.value,
            coverage=round(field_metrics.coverage, 3),
            exact_match=field_metrics.exact_match,
            passed_gate=field_metrics.passed_gate,
        )
    return tuple(metrics), pd.concat(details, ignore_index=True)

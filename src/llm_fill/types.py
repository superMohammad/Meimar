"""Core domain types for the grounded extraction pipeline.

Every structure here is frozen: the pipeline is built from pure functions that
return new values rather than mutating shared state.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import Path


class TargetField(StrEnum):
    """Listing attributes eligible for LLM extraction.

    ROOMS replaces the original `beds` target: the source column conflated
    bedrooms with reception rooms inconsistently, so the pipeline extracts an
    explicitly defined total instead. DRIVER_ROOM is carved out of that total
    and reported separately.
    """

    ROOMS = "rooms"
    LIVINGS = "livings"
    WC = "wc"
    FURNISHED = "furnished"
    AGE = "age"
    STREET_WIDTH = "street_width"
    DRIVER_ROOM = "driver_room"


ALL_TARGETS: tuple[TargetField, ...] = (
    TargetField.ROOMS,
    TargetField.LIVINGS,
    TargetField.WC,
    TargetField.FURNISHED,
    TargetField.AGE,
    TargetField.STREET_WIDTH,
    TargetField.DRIVER_ROOM,
)

# Targets that do not exist as columns in the cleaned source dataset -- the
# merge step creates them rather than filling gaps in them.
NEW_COLUMNS: frozenset[TargetField] = frozenset(
    {TargetField.ROOMS, TargetField.DRIVER_ROOM}
)


class FieldStatus(StrEnum):
    """Outcome of a single (row, field) extraction attempt.

    ACCEPTED and NULL_NOT_MENTIONED are both successes: the model either found
    a grounded value, or correctly reported that the text does not state one.
    """

    ACCEPTED = "accepted"
    ACCEPTED_FUZZY = "accepted_fuzzy"
    NULL_NOT_MENTIONED = "null_not_mentioned"
    REJECTED_UNGROUNDED = "rejected_ungrounded"
    REJECTED_OUT_OF_RANGE = "rejected_out_of_range"
    REJECTED_SCHEMA_INVALID = "rejected_schema_invalid"
    RETRY_EXHAUSTED = "retry_exhausted"


ACCEPTED_STATUSES: frozenset[FieldStatus] = frozenset(
    {FieldStatus.ACCEPTED, FieldStatus.ACCEPTED_FUZZY}
)


@dataclass(frozen=True, slots=True)
class RowTask:
    """One listing to extract from, plus exactly which fields it needs."""

    row_id: int
    clean_text: str
    needed: frozenset[TargetField]


@dataclass(frozen=True, slots=True)
class FieldOutcome:
    """Verdict for a single field after schema, range and grounding checks."""

    field: TargetField
    value: float | bool | None
    evidence: str | None
    status: FieldStatus


@dataclass(frozen=True, slots=True)
class ExtractionResult:
    """Everything recorded about one row, including provenance for auditing."""

    row_id: int
    outcomes: tuple[FieldOutcome, ...]
    model_name: str
    prompt_version: str
    extracted_at: datetime
    attempt_count: int
    latency_ms: int


@dataclass(frozen=True, slots=True)
class OllamaConfig:
    """Connection and decoding parameters for the local Ollama server."""

    host: str
    model: str
    temperature: float
    seed: int
    num_ctx: int
    num_predict: int
    timeout_seconds: float
    max_attempts: int


@dataclass(frozen=True, slots=True)
class RunConfig:
    """Parameters for a full pipeline run."""

    ollama: OllamaConfig
    work_queue_path: Path
    checkpoint_dir: Path
    concurrency: int
    flush_every: int
    consecutive_connection_error_limit: int
    limit: int | None

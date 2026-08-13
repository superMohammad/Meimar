"""Concurrent execution, checkpointing and resume.

Rows are independent, so the only shared state is the semaphore bounding how
many requests Ollama sees at once. Results stream out as they complete and are
flushed to append-only part files, so an interrupted run resumes by skipping
ids already on disk rather than redoing them.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path

import duckdb
import httpx
import pandas as pd
import structlog

from llm_fill.client import OllamaConnectionError, OllamaError, extract_row
from llm_fill.prompts import PROMPT_VERSION
from llm_fill.schemas import FIELD_SPECS, evidence_key, value_key
from llm_fill.text import MIN_USABLE_LENGTH
from llm_fill.types import (
    ACCEPTED_STATUSES,
    ALL_TARGETS,
    ExtractionResult,
    FieldOutcome,
    FieldStatus,
    OllamaConfig,
    RowTask,
    RunConfig,
    TargetField,
)
from llm_fill.validate import verify_extraction

logger = structlog.get_logger(__name__)


class CircuitBreakerTripped(Exception):
    """Too many consecutive connection failures: the server is down."""


# The work queue was built against the original targets, so its flag columns
# still carry the old names. `need_beds` marks rows whose room counts are
# missing, which is exactly the set needing the replacement ROOMS target --
# and DRIVER_ROOM is extracted in the same call, since the driver room has to
# be identified anyway in order to exclude it from the room total.
QUEUE_FLAG: dict[TargetField, str] = {
    TargetField.ROOMS: "need_beds",
    TargetField.DRIVER_ROOM: "need_beds",
    TargetField.LIVINGS: "need_livings",
    TargetField.WC: "need_wc",
    TargetField.FURNISHED: "need_furnished",
    TargetField.AGE: "need_age",
    TargetField.STREET_WIDTH: "need_street_width",
}


def load_work_queue(path: Path) -> tuple[RowTask, ...]:
    """Read the work queue into tasks, one per listing needing extraction."""
    frame = pd.read_parquet(path)
    tasks: list[RowTask] = []
    for row in frame.itertuples(index=False):
        needed = frozenset(
            field for field in ALL_TARGETS if getattr(row, QUEUE_FLAG[field])
        )
        text = str(row.clean)
        if not needed or len(text) < MIN_USABLE_LENGTH:
            continue
        tasks.append(RowTask(row_id=int(row.id), clean_text=text, needed=needed))
    return tuple(tasks)


def completed_ids(checkpoint_dir: Path) -> frozenset[int]:
    """Ids already written to the checkpoint directory, for resume."""
    parts = sorted(checkpoint_dir.glob("part_*.parquet"))
    if not parts:
        return frozenset()
    pattern = str(checkpoint_dir / "part_*.parquet")
    rows = duckdb.sql(f"SELECT DISTINCT id FROM read_parquet('{pattern}')").fetchall()
    return frozenset(int(r[0]) for r in rows)


def _exhausted_result(
    task: RowTask, config: OllamaConfig, latency_ms: int
) -> ExtractionResult:
    return ExtractionResult(
        row_id=task.row_id,
        outcomes=tuple(
            FieldOutcome(
                field=field, value=None, evidence=None, status=FieldStatus.RETRY_EXHAUSTED
            )
            for field in ALL_TARGETS
            if field in task.needed
        ),
        model_name=config.model,
        prompt_version=PROMPT_VERSION,
        extracted_at=datetime.now(UTC),
        attempt_count=config.max_attempts,
        latency_ms=latency_ms,
    )


async def _run_one(
    http: httpx.AsyncClient,
    config: OllamaConfig,
    task: RowTask,
    semaphore: asyncio.Semaphore,
) -> tuple[ExtractionResult, bool]:
    """Extract one row. Returns the result and whether it failed on connection."""
    async with semaphore:
        try:
            parsed, attempts, latency_ms = await extract_row(http, config, task)
        except OllamaError as exc:
            is_connection = isinstance(exc, OllamaConnectionError)
            logger.error(
                "row_failed",
                row_id=task.row_id,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            return _exhausted_result(task, config, latency_ms=0), is_connection

    outcomes = verify_extraction(parsed, task.clean_text, task.needed)
    accepted = [o.field.value for o in outcomes if o.status in ACCEPTED_STATUSES]
    logger.info(
        "row_completed",
        row_id=task.row_id,
        fields_requested=sorted(f.value for f in task.needed),
        fields_accepted=sorted(accepted),
        attempt_count=attempts,
        latency_ms=latency_ms,
    )
    return (
        ExtractionResult(
            row_id=task.row_id,
            outcomes=outcomes,
            model_name=config.model,
            prompt_version=PROMPT_VERSION,
            extracted_at=datetime.now(UTC),
            attempt_count=attempts,
            latency_ms=latency_ms,
        ),
        False,
    )


async def execute_tasks(
    tasks: Sequence[RowTask],
    config: OllamaConfig,
    concurrency: int,
    connection_error_limit: int,
) -> AsyncIterator[ExtractionResult]:
    """Yield results as they complete, bounded by `concurrency`.

    Trips a circuit breaker after `connection_error_limit` consecutive
    connection failures: that pattern means Ollama itself is unavailable, and
    grinding through the remaining rows would produce a silently empty run.
    """
    semaphore = asyncio.Semaphore(concurrency)
    consecutive_connection_errors = 0

    limits = httpx.Limits(
        max_connections=concurrency + 4, max_keepalive_connections=concurrency + 4
    )
    async with httpx.AsyncClient(limits=limits) as http:
        pending = [
            asyncio.create_task(_run_one(http, config, task, semaphore))
            for task in tasks
        ]
        try:
            for future in asyncio.as_completed(pending):
                result, is_connection_error = await future
                if is_connection_error:
                    consecutive_connection_errors += 1
                    if consecutive_connection_errors >= connection_error_limit:
                        raise CircuitBreakerTripped(
                            f"{consecutive_connection_errors} consecutive connection "
                            f"failures against {config.host}; aborting run"
                        )
                else:
                    consecutive_connection_errors = 0
                yield result
        finally:
            for task_future in pending:
                task_future.cancel()


def results_to_frame(results: Iterable[ExtractionResult]) -> pd.DataFrame:
    """Flatten results into the checkpoint row layout.

    Every target gets a value/evidence/status triple; fields the row never
    requested stay null with a null status.
    """
    records: list[dict[str, object]] = []
    for result in results:
        record: dict[str, object] = {
            "id": result.row_id,
            "model_name": result.model_name,
            "prompt_version": result.prompt_version,
            "extracted_at": result.extracted_at,
            "attempt_count": result.attempt_count,
            "latency_ms": result.latency_ms,
        }
        for field in ALL_TARGETS:
            record[value_key(field)] = None
            record[evidence_key(field)] = None
            record[f"{field.value}_status"] = None
        for outcome in result.outcomes:
            record[value_key(outcome.field)] = outcome.value
            record[evidence_key(outcome.field)] = outcome.evidence
            record[f"{outcome.field.value}_status"] = outcome.status.value
        records.append(record)
    return pd.DataFrame.from_records(records).astype(checkpoint_dtypes())


def checkpoint_dtypes() -> dict[str, str]:
    """Explicit dtype for every checkpoint column.

    Without this, a part file whose values happen to be entirely null is
    written with a null column type while the next part writes a real type.
    Readers that infer schema from the first file -- including the DuckDB
    query behind resume -- then fail to load the set. Pinning the dtypes keeps
    every part byte-compatible regardless of what a given batch contained.
    """
    dtypes: dict[str, str] = {
        "id": "int64",
        "model_name": "string",
        "prompt_version": "string",
        "attempt_count": "int64",
        "latency_ms": "int64",
    }
    for field in ALL_TARGETS:
        spec_type = FIELD_SPECS[field].python_type
        if spec_type is bool:
            dtypes[value_key(field)] = "boolean"
        elif spec_type is float:
            dtypes[value_key(field)] = "Float64"
        else:
            dtypes[value_key(field)] = "Int64"
        dtypes[evidence_key(field)] = "string"
        dtypes[f"{field.value}_status"] = "string"
    return dtypes


def write_part(frame: pd.DataFrame, checkpoint_dir: Path, part_index: int) -> Path:
    """Write one append-only checkpoint part file."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    path = checkpoint_dir / f"part_{part_index:06d}.parquet"
    frame.to_parquet(path, index=False)
    return path


async def run_pipeline(config: RunConfig) -> int:
    """Run extraction over the pending work queue. Returns rows processed."""
    tasks = load_work_queue(config.work_queue_path)
    already_done = completed_ids(config.checkpoint_dir)
    pending = tuple(t for t in tasks if t.row_id not in already_done)
    if config.limit is not None:
        pending = pending[: config.limit]

    logger.info(
        "run_started",
        model=config.ollama.model,
        concurrency=config.concurrency,
        total_rows=len(tasks),
        already_done=len(already_done),
        pending_rows=len(pending),
    )

    existing_parts = len(list(config.checkpoint_dir.glob("part_*.parquet")))
    buffer: list[ExtractionResult] = []
    processed = 0
    part_index = existing_parts

    async for result in execute_tasks(
        tasks=pending,
        config=config.ollama,
        concurrency=config.concurrency,
        connection_error_limit=config.consecutive_connection_error_limit,
    ):
        buffer.append(result)
        processed += 1
        if len(buffer) >= config.flush_every:
            write_part(results_to_frame(buffer), config.checkpoint_dir, part_index)
            logger.info("checkpoint_flushed", part_index=part_index, rows=len(buffer))
            buffer = []
            part_index += 1

    if buffer:
        write_part(results_to_frame(buffer), config.checkpoint_dir, part_index)
        logger.info("checkpoint_flushed", part_index=part_index, rows=len(buffer))

    logger.info("run_finished", processed_rows=processed)
    return processed


def field_from_column(column: str) -> TargetField:
    """Map a `{field}_value` column name back to its target field."""
    for field in ALL_TARGETS:
        if column == value_key(field):
            return field
    raise ValueError(f"not a value column: {column}")

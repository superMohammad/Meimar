"""Throughput measurement.

Ollama serialises requests unless OLLAMA_NUM_PARALLEL grants it more slots, so
client-side concurrency alone proves nothing. This sweep measures real
end-to-end rows/second per (model, concurrency) pair and projects the full-queue
runtime from it.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

import structlog

from llm_fill.pipeline import execute_tasks, load_work_queue
from llm_fill.types import ACCEPTED_STATUSES, OllamaConfig, RowTask

logger = structlog.get_logger(__name__)

FULL_QUEUE_ROWS = 211_665


@dataclass(frozen=True, slots=True)
class BenchmarkResult:
    """Measured throughput for one configuration."""

    model: str
    concurrency: int
    rows: int
    elapsed_seconds: float
    rows_per_second: float
    mean_latency_ms: float
    accepted_fields: int
    projected_full_queue_hours: float


async def _measure(
    tasks: tuple[RowTask, ...], config: OllamaConfig, concurrency: int
) -> BenchmarkResult:
    latencies: list[int] = []
    accepted = 0
    started = time.monotonic()

    async for result in execute_tasks(
        tasks=tasks,
        config=config,
        concurrency=concurrency,
        connection_error_limit=20,
    ):
        latencies.append(result.latency_ms)
        accepted += sum(1 for o in result.outcomes if o.status in ACCEPTED_STATUSES)

    elapsed = time.monotonic() - started
    rows_per_second = len(tasks) / elapsed if elapsed else 0.0
    return BenchmarkResult(
        model=config.model,
        concurrency=concurrency,
        rows=len(tasks),
        elapsed_seconds=elapsed,
        rows_per_second=rows_per_second,
        mean_latency_ms=sum(latencies) / len(latencies) if latencies else 0.0,
        accepted_fields=accepted,
        projected_full_queue_hours=(
            FULL_QUEUE_ROWS / rows_per_second / 3600 if rows_per_second else float("inf")
        ),
    )


def _warm_up(config: OllamaConfig, task: RowTask) -> None:
    """Load the model into VRAM so the first timed row is not paying for it."""

    async def _one() -> None:
        async for _ in execute_tasks(
            tasks=(task,), config=config, concurrency=1, connection_error_limit=20
        ):
            return

    asyncio.run(_one())


def run_benchmark(
    work_queue_path: Path,
    base_config: OllamaConfig,
    models: tuple[str, ...],
    concurrencies: tuple[int, ...],
    sample_size: int,
    seed: int,
) -> tuple[BenchmarkResult, ...]:
    """Sweep models x concurrency over the same sample of real rows."""
    import random

    all_tasks = load_work_queue(work_queue_path)
    rng = random.Random(seed)
    tasks = tuple(rng.sample(list(all_tasks), min(sample_size, len(all_tasks))))

    results: list[BenchmarkResult] = []
    for model in models:
        config = OllamaConfig(
            host=base_config.host,
            model=model,
            temperature=base_config.temperature,
            seed=base_config.seed,
            num_ctx=base_config.num_ctx,
            num_predict=base_config.num_predict,
            timeout_seconds=base_config.timeout_seconds,
            max_attempts=base_config.max_attempts,
        )
        _warm_up(config, tasks[0])
        for concurrency in concurrencies:
            result = asyncio.run(_measure(tasks, config, concurrency))
            logger.info(
                "benchmark_measured",
                model=model,
                concurrency=concurrency,
                rows_per_second=round(result.rows_per_second, 2),
                projected_hours=round(result.projected_full_queue_hours, 1),
            )
            results.append(result)
    return tuple(results)

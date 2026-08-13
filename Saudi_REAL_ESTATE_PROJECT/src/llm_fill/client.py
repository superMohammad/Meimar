"""Async Ollama client with explicit retry semantics.

Failures are never swallowed. Each attempt logs a structured warning, and once
attempts are exhausted the last error is raised with enough context to debug:
row id, attempt count, status code and response body.
"""

from __future__ import annotations

import asyncio
import json
import random
import time

import httpx
import structlog
from pydantic import BaseModel, ValidationError

from llm_fill.prompts import SYSTEM_PROMPT, build_user_prompt
from llm_fill.schemas import build_json_schema, build_schema
from llm_fill.types import OllamaConfig, RowTask

logger = structlog.get_logger(__name__)

BACKOFF_BASE_SECONDS = 1.0
BACKOFF_JITTER_SECONDS = 0.25


class OllamaError(Exception):
    """Base class for extraction transport and contract failures."""


class OllamaConnectionError(OllamaError):
    """The server was unreachable, timed out, or returned a server-side error.

    Tracked separately so the pipeline can trip its circuit breaker: a run of
    these means Ollama is down, not that one listing is awkward.
    """


class OllamaResponseError(OllamaError):
    """The server replied, but the payload was not usable structured output."""


def _request_body(config: OllamaConfig, task: RowTask) -> dict[str, object]:
    return {
        "model": config.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(task.clean_text, task.needed)},
        ],
        "format": build_json_schema(task.needed),
        "stream": False,
        "think": False,
        "options": {
            "temperature": config.temperature,
            "seed": config.seed,
            "num_ctx": config.num_ctx,
            "num_predict": config.num_predict,
        },
    }


async def _attempt(
    http: httpx.AsyncClient, config: OllamaConfig, task: RowTask
) -> BaseModel:
    """Run one request/parse/validate cycle. Raises on any failure."""
    try:
        response = await http.post(
            f"{config.host}/api/chat",
            json=_request_body(config, task),
            timeout=config.timeout_seconds,
        )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        raise OllamaConnectionError(
            f"transport failure for row {task.row_id}: {type(exc).__name__}: {exc}"
        ) from exc

    if response.status_code >= 500:
        raise OllamaConnectionError(
            f"server error for row {task.row_id}: status={response.status_code} "
            f"body={response.text[:500]}"
        )
    if response.status_code != 200:
        raise OllamaResponseError(
            f"unexpected status for row {task.row_id}: status={response.status_code} "
            f"body={response.text[:500]}"
        )

    try:
        envelope = response.json()
        content = envelope["message"]["content"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise OllamaResponseError(
            f"malformed envelope for row {task.row_id}: {exc}; body={response.text[:500]}"
        ) from exc

    model = build_schema(task.needed)
    try:
        return model.model_validate_json(content)
    except ValidationError as exc:
        raise OllamaResponseError(
            f"schema violation for row {task.row_id}: {exc.error_count()} errors; "
            f"content={content[:500]}"
        ) from exc


async def extract_row(
    http: httpx.AsyncClient, config: OllamaConfig, task: RowTask
) -> tuple[BaseModel, int, int]:
    """Extract one row, retrying transient failures.

    Returns the validated model, the number of attempts used, and the total
    latency in milliseconds. Raises the last error once attempts are exhausted.
    """
    started = time.monotonic()
    last_error: OllamaError | None = None

    for attempt in range(1, config.max_attempts + 1):
        try:
            parsed = await _attempt(http, config, task)
        except OllamaError as exc:
            last_error = exc
            logger.warning(
                "extraction_attempt_failed",
                row_id=task.row_id,
                attempt=attempt,
                max_attempts=config.max_attempts,
                error_type=type(exc).__name__,
                error_message=str(exc),
            )
            if attempt < config.max_attempts:
                delay = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                await asyncio.sleep(delay + random.uniform(0, BACKOFF_JITTER_SECONDS))
            continue

        latency_ms = int((time.monotonic() - started) * 1000)
        return parsed, attempt, latency_ms

    raise last_error  # type: ignore[misc]

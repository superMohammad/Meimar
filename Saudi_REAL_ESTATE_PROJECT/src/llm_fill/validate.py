"""Grounding and range verification.

A value is accepted only when the model quoted a span of the source text that
actually exists in it. This is an external, mechanical fact-check: unlike a
self-reported confidence score -- which is itself just another generated token
and is poorly calibrated -- a substring check cannot be talked around by a
confident model.
"""

from __future__ import annotations

from pydantic import BaseModel
from rapidfuzz import fuzz

from llm_fill.schemas import FIELD_SPECS, evidence_key, value_key
from llm_fill.text import collapse_whitespace
from llm_fill.types import ALL_TARGETS, FieldOutcome, FieldStatus, TargetField

FUZZY_THRESHOLD = 90.0
MIN_EVIDENCE_LENGTH = 2


def _is_grounded(evidence: str, haystack: str) -> tuple[bool, bool]:
    """Return (grounded, needed_fuzzy) for one evidence span."""
    needle = collapse_whitespace(evidence)
    if len(needle) < MIN_EVIDENCE_LENGTH:
        return False, False
    if needle in haystack:
        return True, False
    return fuzz.partial_ratio(needle, haystack) >= FUZZY_THRESHOLD, True


def _in_range(field: TargetField, value: float | bool) -> bool:
    spec = FIELD_SPECS[field]
    if spec.python_type is bool:
        return isinstance(value, bool)
    if isinstance(value, bool):
        return False
    if spec.minimum is not None and value < spec.minimum:
        return False
    if spec.maximum is not None and value > spec.maximum:
        return False
    return True


EVIDENCE_SEPARATOR = " | "


def _ground_spans(spans: list[str], haystack: str) -> tuple[bool, bool]:
    """Ground every span independently. Returns (all_grounded, any_fuzzy).

    All-or-nothing on purpose: a summed value is only as trustworthy as its
    weakest component, so one invented span invalidates the total.
    """
    if not spans:
        return False, False
    any_fuzzy = False
    for span in spans:
        grounded, needed_fuzzy = _is_grounded(span, haystack)
        if not grounded:
            return False, any_fuzzy
        any_fuzzy = any_fuzzy or needed_fuzzy
    return True, any_fuzzy


def _classify(
    field: TargetField,
    value: float | bool | None,
    evidence: str | list[str] | None,
    haystack: str,
) -> FieldOutcome:
    if value is None:
        # Evidence without a value is contradictory; drop the evidence.
        return FieldOutcome(
            field=field,
            value=None,
            evidence=None,
            status=FieldStatus.NULL_NOT_MENTIONED,
        )

    if evidence is None:
        return FieldOutcome(
            field=field,
            value=None,
            evidence=None,
            status=FieldStatus.REJECTED_SCHEMA_INVALID,
        )

    spans = evidence if isinstance(evidence, list) else [evidence]
    recorded = EVIDENCE_SEPARATOR.join(spans)

    if not _in_range(field, value):
        return FieldOutcome(
            field=field,
            value=None,
            evidence=recorded,
            status=FieldStatus.REJECTED_OUT_OF_RANGE,
        )

    grounded, needed_fuzzy = _ground_spans(spans, haystack)
    evidence = recorded
    if not grounded:
        return FieldOutcome(
            field=field,
            value=None,
            evidence=evidence,
            status=FieldStatus.REJECTED_UNGROUNDED,
        )

    return FieldOutcome(
        field=field,
        value=value,
        evidence=evidence,
        status=FieldStatus.ACCEPTED_FUZZY if needed_fuzzy else FieldStatus.ACCEPTED,
    )


def verify_extraction(
    parsed: BaseModel, clean_text: str, needed: frozenset[TargetField]
) -> tuple[FieldOutcome, ...]:
    """Turn a schema-valid model response into verified per-field outcomes.

    Pure: derives new outcomes, mutates nothing.
    """
    haystack = collapse_whitespace(clean_text)
    payload = parsed.model_dump()
    ordered = [f for f in ALL_TARGETS if f in needed]
    return tuple(
        _classify(
            field=field,
            value=payload[value_key(field)],
            evidence=payload[evidence_key(field)],
            haystack=haystack,
        )
        for field in ordered
    )

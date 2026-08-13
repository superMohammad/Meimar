"""Prompt construction and versioning.

PROMPT_VERSION is a hash of the template plus the field descriptions, so any
edit to the wording produces a different version stamp in the checkpoint. That
makes it possible to tell which rows were extracted under which prompt without
relying on run timestamps.
"""

from __future__ import annotations

import hashlib

from llm_fill.schemas import FIELD_SPECS, evidence_key, value_key
from llm_fill.types import ALL_TARGETS, TargetField

SYSTEM_PROMPT = """You extract structured facts from Arabic real-estate listing text.

Rules, in priority order:
1. Extract ONLY what the text explicitly states. Never infer, estimate, or use
   general knowledge about typical Saudi properties.
2. If the text does not state a field, return null for that field. A missing
   value is a correct answer. Guessing is a failure.
3. For every non-null value, copy into the matching *_evidence key the exact
   substring of the listing text that states it -- character for character, as
   it appears in the text. Do not translate, paraphrase, reorder or re-spell it.
4. When a value is null, its evidence must also be null.
5. Numbers written as Arabic words (واحد, اثنين, ثلاث, اربع, خمس, ست) count as
   explicit statements. Convert them to digits in the value, but the evidence
   must still quote the original wording.
6. Ignore phone numbers, license numbers, prices and areas -- they are never
   answers to these fields."""


def _field_instruction(field: TargetField) -> str:
    spec = FIELD_SPECS[field]
    return f"- {value_key(field)} / {evidence_key(field)}: {spec.description}"


def build_user_prompt(clean_text: str, fields: frozenset[TargetField]) -> str:
    """Return the user message for one listing, covering only `fields`."""
    if not fields:
        raise ValueError("build_user_prompt requires at least one target field")
    ordered = [f for f in ALL_TARGETS if f in fields]
    instructions = "\n".join(_field_instruction(f) for f in ordered)
    return (
        f"Extract these fields:\n{instructions}\n\n"
        f"Listing text:\n<<<\n{clean_text}\n>>>"
    )


def _compute_prompt_version() -> str:
    payload = SYSTEM_PROMPT + "".join(
        f"{f.value}:{FIELD_SPECS[f].description}" for f in ALL_TARGETS
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


PROMPT_VERSION: str = _compute_prompt_version()

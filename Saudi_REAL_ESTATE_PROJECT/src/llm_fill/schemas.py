"""Dynamic per-row extraction schemas.

Each work-queue row needs only the subset of fields flagged by its `need_*`
columns. Building a schema containing exactly those fields shrinks the output
token count and removes any opportunity for the model to volunteer a value for
a field nobody asked about.

The generated JSON Schema is handed to Ollama's `format` parameter, which
constrains decoding so the response is schema-conformant by construction --
there is no free-text parsing anywhere in this pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

from pydantic import BaseModel, Field, create_model

from llm_fill.types import ALL_TARGETS, TargetField

# Ranges come from percentiles of the non-null source data: wide enough not to
# clip legitimate outliers, tight enough that garbage is rejected.
ROOMS_MAX = 40
LIVINGS_MAX = 10
WC_MAX = 10
AGE_MAX = 60
STREET_WIDTH_MIN = 1.0
STREET_WIDTH_MAX = 200.0


@dataclass(frozen=True, slots=True)
class FieldSpec:
    """How one target field is typed, bounded and described to the model."""

    field: TargetField
    python_type: type[int] | type[float] | type[bool]
    minimum: float | None
    maximum: float | None
    description: str


FIELD_SPECS: dict[TargetField, FieldSpec] = {
    TargetField.ROOMS: FieldSpec(
        field=TargetField.ROOMS,
        python_type=int,
        minimum=0,
        maximum=ROOMS_MAX,
        description=(
            "TOTAL number of rooms in the whole property. COUNT: bedrooms "
            "(غرف نوم / غرف / ماستر), majlis (مجلس / مجالس), maqlat (مقلط / "
            "مجلط), salas (صالة / صالات / صالة معيشة), and the maid room "
            "(غرفة خادمة / غرفة شغالة). DO NOT COUNT: the driver room (غرفة "
            "سائق / ملحق سائق) -- report it in driver_room instead -- nor "
            "kitchens, bathrooms, storage or garages. Listings often describe "
            "one floor at a time: add every floor together. If the text "
            "describes a building of repeated identical apartments, give the "
            "count for a single apartment, not the building."
        ),
    ),
    TargetField.DRIVER_ROOM: FieldSpec(
        field=TargetField.DRIVER_ROOM,
        python_type=bool,
        minimum=None,
        maximum=None,
        description=(
            "true if the listing mentions a driver's room (غرفة سائق / غرفة "
            "سايق / ملحق سائق / غرفة السواق). Use null when no driver room is "
            "mentioned anywhere in the text."
        ),
    ),
    TargetField.LIVINGS: FieldSpec(
        field=TargetField.LIVINGS,
        python_type=int,
        minimum=0,
        maximum=LIVINGS_MAX,
        description=(
            "Number of salas -- living/family rooms explicitly called صالة or "
            "صالات or صالة معيشة. Do NOT count مجلس, مجالس, مقلط or مشب: those "
            "are reception rooms and are excluded from this field. Do not count "
            "bedrooms or kitchens."
        ),
    ),
    TargetField.WC: FieldSpec(
        field=TargetField.WC,
        python_type=int,
        minimum=0,
        maximum=WC_MAX,
        description=(
            "TOTAL number of bathrooms in the whole property (حمام / حمامات / "
            "دورة مياه / دورات مياه). Listings often describe one floor at a "
            "time -- add every floor's bathrooms together. If the text "
            "describes a building of repeated identical apartments, give the "
            "count for a single apartment, not the building."
        ),
    ),
    TargetField.FURNISHED: FieldSpec(
        field=TargetField.FURNISHED,
        python_type=bool,
        minimum=None,
        maximum=None,
        description=(
            "true if the listing states it is furnished (مفروش / مفروشة / "
            "بالفرش / اثاث), false only if it explicitly states unfurnished "
            "(غير مفروش / بدون فرش). Use null when furnishing is never mentioned."
        ),
    ),
    TargetField.AGE: FieldSpec(
        field=TargetField.AGE,
        python_type=int,
        minimum=0,
        maximum=AGE_MAX,
        description=(
            "Age of the building in years (عمر العقار / عمر البناء). Use 0 for "
            "a new/never-occupied build (جديد / جديدة / لم تسكن). If the text "
            "gives a construction year, subtract it from 2026."
        ),
    ),
    TargetField.STREET_WIDTH: FieldSpec(
        field=TargetField.STREET_WIDTH,
        python_type=float,
        minimum=STREET_WIDTH_MIN,
        maximum=STREET_WIDTH_MAX,
        description=(
            "Width of the street the property faces, in metres (عرض الشارع / "
            "شارع ٢٠ / الشارع عرض). Not the property's own dimensions or area."
        ),
    ),
}


# Fields whose value is computed by summing several mentions rather than read
# from one stated figure. No single verbatim span states the answer, so these
# quote a list of short spans -- one per component -- and each is grounded
# independently. Demanding a single span here rejected 38% of valid answers.
DERIVED_FIELDS: frozenset[TargetField] = frozenset({TargetField.ROOMS})

SINGLE_EVIDENCE_DESCRIPTION = (
    "The exact substring of the listing text that states this value, copied "
    "verbatim. null when the value is null."
)
LIST_EVIDENCE_DESCRIPTION = (
    "REQUIRED whenever the value is not null: a list of SHORT verbatim quotes, "
    "one for each group of rooms you counted (for example [\"2مجلس\", \"صاله\", "
    "\"4غرف نوم\"]). Copy each quote exactly as it appears in the text, a few "
    "words at most -- never a whole sentence or paragraph. Every counted room "
    "must appear in exactly one quote. Use an empty list [] only when the "
    "value is null."
)


def value_key(field: TargetField) -> str:
    return f"{field.value}_value"


def evidence_key(field: TargetField) -> str:
    return f"{field.value}_evidence"


def _build_model(fields: tuple[TargetField, ...]) -> type[BaseModel]:
    """Create a flat Pydantic model covering exactly `fields`.

    Flat by design -- no nested models, so the emitted JSON Schema carries no
    $defs/$ref indirection for the structured-output grammar to resolve.
    """
    definitions: dict[str, tuple[object, object]] = {}
    for field in fields:
        spec = FIELD_SPECS[field]
        constraints: dict[str, float] = {}
        if spec.minimum is not None:
            constraints["ge"] = spec.minimum
        if spec.maximum is not None:
            constraints["le"] = spec.maximum
        definitions[value_key(field)] = (
            spec.python_type | None,
            Field(description=spec.description, **constraints),
        )
        is_derived = field in DERIVED_FIELDS
        # Derived-field evidence is a non-nullable array: offering `null` as an
        # option let the model return a value with no evidence at all, which
        # the validator can only reject. An empty list carries "no value".
        definitions[evidence_key(field)] = (
            list[str] if is_derived else str | None,
            Field(
                description=(
                    LIST_EVIDENCE_DESCRIPTION
                    if is_derived
                    else SINGLE_EVIDENCE_DESCRIPTION
                )
            ),
        )
    return create_model("Extraction", **definitions)


@cache
def build_schema(fields: frozenset[TargetField]) -> type[BaseModel]:
    """Return the model for this field combination, built once and reused.

    Only 46 of the 64 possible combinations occur in the real work queue, so
    the cache stays small over a full run.
    """
    if not fields:
        raise ValueError("build_schema requires at least one target field")
    ordered = tuple(f for f in ALL_TARGETS if f in fields)
    return _build_model(ordered)


def build_json_schema(fields: frozenset[TargetField]) -> dict[str, object]:
    """Return the JSON Schema object to pass as Ollama's `format` parameter."""
    return build_schema(fields).model_json_schema()

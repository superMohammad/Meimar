"""Render the text-extraction workflow diagram to a vector PDF.

One diagram covering both paths that turn the free-text `title` and `content`
columns into model features: the regex feature pass in
notebook/Exploring_Data_and_sketchs.ipynb, and the grounded LLM extraction in
src/llm_fill. Row counts are the real ones from data/.

Arabic is written out in English on purpose -- matplotlib does not shape Arabic
script, so embedded Arabic renders as disconnected or missing glyphs.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import matplotlib
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402  (backend must be set first)

OUTPUT_PDF = Path(__file__).resolve().parent / "text_extraction_workflow.pdf"
OUTPUT_PNG = Path(__file__).resolve().parent / "text_extraction_workflow.png"

# The axes are drawn in abstract units and the figure is sized from them at a
# fixed density, so x and y stay at the same scale however tall the diagram gets.
PAGE_WIDTH_INCHES = 16.0
X_UNITS = 100.0
UNITS_PER_INCH = X_UNITS / PAGE_WIDTH_INCHES
TOP_Y = 140.0
BACKGROUND = "#fcfcfb"
INK = "#1d1d1b"
MUTED = "#6b6a66"
BLUE = "#2a78d6"
RED = "#e34948"
GREEN = "#1baf7a"
LANE_A_FILL = "#eaf1fb"
LANE_B_FILL = "#fdeceb"
NEUTRAL_FILL = "#eeedea"

FONT = "DejaVu Sans"


@dataclass(frozen=True, slots=True)
class Step:
    """One numbered box inside a lane."""

    tag: str
    heading: str
    body: str


SOURCE_TITLE = "real_estate.parquet  —  810,888 listings"
SOURCE_BODY = (
    "title  (short headline)          content  (free-text advertisement body)\n"
    "87% of the file is these two text columns: content 196 MB, title 22 MB"
)

LANE_A_TITLE = "A. Keyword feature pass  —  reads title + content"
LANE_A_SOURCE = "notebook/Exploring_Data_and_sketchs.ipynb"
LANE_A_STEPS: tuple[Step, ...] = (
    Step(
        "A1",
        "Join the two columns",
        "text = title + \" \" + content, nulls treated as empty",
    ),
    Step(
        "A2",
        "Normalise the Arabic",
        "emoji and invisible RTL marks to spaces; tatweel and diacritics removed;\n"
        "alef, ya, ta-marbuta, hamza variants unified; letters repeated 3+ times collapsed",
    ),
    Step(
        "A3",
        "Fold digits",
        "Arabic-Indic digits rewritten as Latin 0-9",
    ),
    Step(
        "A4",
        "Delete negated phrases",
        "\"no X\" / \"without X\" / \"not X\" plus the following words are cut out,\n"
        "so a denied feature can never match as if it were present",
    ),
    Step(
        "A5",
        "Match 19 keyword patterns",
        "one int8 flag per pattern: ac, parking, pool, kitchen, driver room, basement,\n"
        "garden, yard, two entrances, corner, near masjid, investment, negotiable, urgent\n"
        "near-park wording is stripped first, so \"close to the park\"\n"
        "is not read as \"has a garden\"",
    ),
    Step(
        "A6",
        "Prefer the seller's own answer",
        "where the listing form supplied ac / kitchen, that value overrides the keyword flag",
    ),
)
LANE_A_OUTPUT = "20 binary feature columns\nhas_ac · has_parking · has_pool · is_corner · near_masjid · …"

LANE_B_TITLE = "B. Grounded LLM extraction  —  reads content only"
LANE_B_SOURCE = "src/llm_fill  (local Ollama, gemma4:26b)"
LANE_B_STEPS: tuple[Step, ...] = (
    Step(
        "B1",
        "Normalise the content",
        "digits folded, URLs / phone numbers / emoji to spaces, diacritics removed,\n"
        "alef and ya unified, whitespace collapsed  ->  the `clean` column",
    ),
    Step(
        "B2",
        "Build the work queue",
        "a row is queued for a field only when the value is missing, the field applies\n"
        "to that estate type, and len(clean) >= 10\n"
        "-> 211,665 rows, each carrying its own need_* flags",
    ),
    Step(
        "B3",
        "Build a per-row JSON Schema",
        "a Pydantic model covering exactly the fields that row needs, with type and\n"
        "range bounds, passed as Ollama's `format`: decoding is constrained by the\n"
        "schema, so no reply is ever free-text parsed",
    ),
    Step(
        "B4",
        "Ask the model, once per row",
        "temperature 0, fixed seed, async under a bounded semaphore; retries with\n"
        "exponential backoff, and a circuit breaker that aborts the whole run\n"
        "once the failures say the server itself is down",
    ),
    Step(
        "B5",
        "Verify every answer against the text",
        "the value must fall in range AND each quoted evidence span must occur in\n"
        "`clean` — exact match, else rapidfuzz partial ratio >= 90\n"
        "-> accepted · accepted_fuzzy · null_not_mentioned · rejected_*",
    ),
    Step(
        "B6",
        "Checkpoint as it goes",
        "append-only part_000000.parquet … part_000845.parquet; an interrupted run\n"
        "resumes by skipping the ids already on disk",
    ),
    Step(
        "B7",
        "Gate on measured accuracy",
        "accuracy measured per field x estate type on 400 held-out labelled rows;\n"
        "below the bar the value is kept but flagged needs_human_review instead of filled",
    ),
)
LANE_B_OUTPUT = (
    "7 extracted attributes\nrooms · driver_room · livings · wc · furnished · age · street_width"
)

MERGE_TITLE = "real_estate_final.parquet  —  781,398 rows"
MERGE_BODY = (
    "keyword flags and gated LLM values written in together; an existing seller-supplied value is never overwritten,\n"
    "and every field carries a {field}_extraction_status column recording where its value came from"
)

FINAL_TITLE = "SELL / RENT_REAL_ESTATE_FOR_MODELING.parquet  —  533,399 + 145,991 rows"
FINAL_BODY = (
    "title and content are dropped here: the text has already been turned into columns.\n"
    "That is why these files are 5.8 MB and 1.5 MB against 250 MB  ->  notebook/Modeling.ipynb"
)


def box(
    ax: plt.Axes,
    x: float,
    y: float,
    width: float,
    height: float,
    facecolor: str,
    edgecolor: str,
    linewidth: float,
    zorder: int,
) -> None:
    """Draw one rounded rectangle, centred on (x, y)."""
    ax.add_patch(
        FancyBboxPatch(
            (x - width / 2, y - height / 2),
            width,
            height,
            boxstyle="round,pad=0,rounding_size=0.9",
            facecolor=facecolor,
            edgecolor=edgecolor,
            linewidth=linewidth,
            zorder=zorder,
        )
    )


def arrow(ax: plt.Axes, x0: float, y0: float, x1: float, y1: float, color: str) -> None:
    """Draw one connector between two boxes."""
    ax.add_patch(
        FancyArrowPatch(
            (x0, y0),
            (x1, y1),
            arrowstyle="-|>",
            mutation_scale=13,
            linewidth=1.3,
            color=color,
            shrinkA=0,
            shrinkB=0,
            zorder=4,
        )
    )


def draw_step(ax: plt.Axes, step: Step, x: float, y: float, width: float, height: float, accent: str) -> None:
    """Draw one numbered step box with its heading and body text."""
    box(ax, x, y, width, height, "#ffffff", "#d9d8d4", 1.0, zorder=3)
    left = x - width / 2
    ax.text(
        left + 1.1,
        y + height / 2 - 1.5,
        step.tag,
        fontsize=9,
        fontweight="bold",
        color=accent,
        family=FONT,
        va="center",
        zorder=5,
    )
    ax.text(
        left + 4.2,
        y + height / 2 - 1.5,
        step.heading,
        fontsize=10.5,
        fontweight="bold",
        color=INK,
        family=FONT,
        va="center",
        zorder=5,
    )
    ax.text(
        left + 4.2,
        y + height / 2 - 3.5,
        step.body,
        fontsize=8.4,
        color=MUTED,
        family=FONT,
        va="top",
        linespacing=1.45,
        zorder=5,
    )


def draw_lane(
    ax: plt.Axes,
    centre_x: float,
    top_y: float,
    width: float,
    title: str,
    source: str,
    steps: tuple[Step, ...],
    heights: tuple[float, ...],
    output_text: str,
    accent: str,
    lane_fill: str,
) -> float:
    """Draw one lane top-down. Returns the y of the bottom of its output box."""
    gap = 1.5
    header_height = 4.4
    output_height = 5.0
    body = sum(heights) + gap * len(heights)
    lane_height = header_height + body + output_height + 3.2
    lane_centre_y = top_y - lane_height / 2

    box(ax, centre_x, lane_centre_y, width + 2.4, lane_height, lane_fill, "none", 0, zorder=1)

    ax.text(
        centre_x,
        top_y - 1.9,
        title,
        fontsize=13,
        fontweight="bold",
        color=accent,
        family=FONT,
        ha="center",
        va="center",
        zorder=5,
    )
    ax.text(
        centre_x,
        top_y - 3.7,
        source,
        fontsize=9,
        color=MUTED,
        family=FONT,
        ha="center",
        va="center",
        style="italic",
        zorder=5,
    )

    y = top_y - header_height
    for step, height in zip(steps, heights, strict=True):
        centre = y - height / 2
        draw_step(ax, step, centre_x, centre, width, height, accent)
        y -= height + gap
        arrow(ax, centre_x, centre - height / 2, centre_x, centre - height / 2 - gap, accent)

    y -= 0.4
    out_centre = y - output_height / 2
    box(ax, centre_x, out_centre, width, output_height, accent, "none", 0, zorder=3)
    ax.text(
        centre_x,
        out_centre,
        output_text,
        fontsize=10,
        fontweight="bold",
        color="#ffffff",
        family=FONT,
        ha="center",
        va="center",
        linespacing=1.7,
        zorder=5,
    )
    return out_centre - output_height / 2


def render() -> Path:
    """Draw the whole figure and write it as PDF and PNG."""
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_INCHES, PAGE_WIDTH_INCHES))
    fig.patch.set_facecolor(BACKGROUND)
    ax.set_facecolor(BACKGROUND)
    ax.set_xlim(0, X_UNITS)
    ax.axis("off")

    ax.text(
        50,
        TOP_Y - 2.4,
        "From advertisement text to model features",
        fontsize=19,
        fontweight="bold",
        color=INK,
        family=FONT,
        ha="center",
        va="center",
    )
    ax.text(
        50,
        TOP_Y - 5.2,
        "Saudi real-estate listings — how the title and content columns were turned into structured data",
        fontsize=11,
        color=MUTED,
        family=FONT,
        ha="center",
        va="center",
    )

    source_y = TOP_Y - 10.0
    box(ax, 50, source_y, 62, 6.4, NEUTRAL_FILL, "#cfcec9", 1.2, zorder=3)
    ax.text(
        50,
        source_y + 1.5,
        SOURCE_TITLE,
        fontsize=11.5,
        fontweight="bold",
        color=INK,
        family=FONT,
        ha="center",
        va="center",
        zorder=5,
    )
    ax.text(
        50,
        source_y - 1.2,
        SOURCE_BODY,
        fontsize=8.8,
        color=MUTED,
        family=FONT,
        ha="center",
        va="center",
        linespacing=1.5,
        zorder=5,
    )

    lane_top = source_y - 8.0
    lane_width = 45.0
    left_x, right_x = 25.5, 74.5

    arrow(ax, 50, source_y - 3.2, left_x, lane_top + 0.4, BLUE)
    arrow(ax, 50, source_y - 3.2, right_x, lane_top + 0.4, RED)

    a_bottom = draw_lane(
        ax,
        left_x,
        lane_top,
        lane_width,
        LANE_A_TITLE,
        LANE_A_SOURCE,
        LANE_A_STEPS,
        (6.2, 8.0, 5.6, 7.6, 10.8, 6.6),
        LANE_A_OUTPUT,
        BLUE,
        LANE_A_FILL,
    )
    b_bottom = draw_lane(
        ax,
        right_x,
        lane_top,
        lane_width,
        LANE_B_TITLE,
        LANE_B_SOURCE,
        LANE_B_STEPS,
        (7.6, 9.0, 9.0, 9.0, 9.0, 7.0, 7.6),
        LANE_B_OUTPUT,
        RED,
        LANE_B_FILL,
    )

    merge_y = min(a_bottom, b_bottom) - 9.0
    box(ax, 50, merge_y, 88, 7.0, "#ffffff", GREEN, 1.6, zorder=3)
    ax.text(
        50,
        merge_y + 1.9,
        MERGE_TITLE,
        fontsize=12,
        fontweight="bold",
        color=GREEN,
        family=FONT,
        ha="center",
        va="center",
        zorder=5,
    )
    ax.text(
        50,
        merge_y - 1.1,
        MERGE_BODY,
        fontsize=8.8,
        color=MUTED,
        family=FONT,
        ha="center",
        va="center",
        linespacing=1.5,
        zorder=5,
    )
    arrow(ax, left_x, a_bottom, left_x + 6, merge_y + 3.5, BLUE)
    arrow(ax, right_x, b_bottom, right_x - 6, merge_y + 3.5, RED)

    final_y = merge_y - 11.0
    box(ax, 50, final_y, 88, 7.4, NEUTRAL_FILL, "#cfcec9", 1.2, zorder=3)
    ax.text(
        50,
        final_y + 2.1,
        FINAL_TITLE,
        fontsize=11.5,
        fontweight="bold",
        color=INK,
        family=FONT,
        ha="center",
        va="center",
        zorder=5,
    )
    ax.text(
        50,
        final_y - 1.1,
        FINAL_BODY,
        fontsize=8.8,
        color=MUTED,
        family=FONT,
        ha="center",
        va="center",
        linespacing=1.5,
        zorder=5,
    )
    arrow(ax, 50, merge_y - 3.5, 50, final_y + 3.7, GREEN)

    bottom_y = final_y - 3.7 - 3.0
    ax.set_ylim(bottom_y, TOP_Y)
    fig.set_size_inches(PAGE_WIDTH_INCHES, (TOP_Y - bottom_y) / UNITS_PER_INCH)

    fig.savefig(OUTPUT_PDF, format="pdf", facecolor=BACKGROUND, bbox_inches="tight", pad_inches=0.3)
    fig.savefig(OUTPUT_PNG, dpi=110, facecolor=BACKGROUND, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    return OUTPUT_PDF


if __name__ == "__main__":
    print(render())

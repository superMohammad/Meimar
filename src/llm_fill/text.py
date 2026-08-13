"""Arabic text normalization, ported verbatim from notebook/EDA.ipynb cell 71.

The evaluation harness must rebuild `clean` byte-identically to how the work
queue was built, otherwise measured accuracy does not describe the production
inference path. This module is the single definition of that transform.

Note the notebook derives `clean` from `content` alone -- not title + content.
"""

from __future__ import annotations

import pandas as pd

DIGITS: dict[int, str] = {
    ord(a): b
    for a, b in zip("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789", strict=True)
}

EMOJI = "[\U0001f300-\U0001faff←-⇿⌀-➿⬀-⯿️]"
URL = r"https?://[^\s]+"
PHONE = r"(00966|\+?966)?0?5[0-9]{8}"
DIACRITICS = "[ً-ْٰـ]"

MIN_USABLE_LENGTH = 10


def normalize_content(content: pd.Series) -> pd.Series:
    """Return a new Series of cleaned listing text. Never mutates the argument.

    Mirrors EDA.ipynb `normalize()` exactly: Arabic-Indic digits folded to
    Latin, URLs/phones/emoji stripped to spaces, diacritics removed, alef and
    ya variants unified, whitespace collapsed.
    """
    s = content.fillna("")
    s = s.str.translate(DIGITS)
    s = s.str.replace(URL, " ", regex=True)
    s = s.str.replace(PHONE, " ", regex=True)
    s = s.str.replace(EMOJI, " ", regex=True)
    s = s.str.replace(DIACRITICS, "", regex=True)
    s = s.str.replace("[إأآٱ]", "ا", regex=True)
    s = s.str.replace("ى", "ي", regex=False)
    s = s.str.replace(r"\s+", " ", regex=True).str.strip()
    return s


def collapse_whitespace(text: str) -> str:
    """Normalize runs of whitespace to single spaces for grounding comparison."""
    return " ".join(text.split())

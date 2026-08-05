"""booklingua_gate_additions.py — Extra quality checks for booklingua_gate.py

Implements:
  - check_language_consistency()  → catches untranslated paragraphs (Tina's bug)
  - check_structural_integrity()  → catches missing bibliographies, wrong ratios
"""

import re
from typing import List, Tuple
from langdetect import detect, LangDetectException

# Languages we support and their langdetect short codes
_LANG_MAP = {
    'de': 'de', 'it': 'it', 'es': 'es', 'fr': 'fr',
    'pt': 'pt', 'ja': 'ja', 'pl': 'pl',
}

# Paragraphs that look like bibliography/reference entries (numbered, URLs, years, etc.)
_BIB_RE = re.compile(
    r'^(\d+\s+)?'                          # optional leading number
    r'.*(?:https?://|www\.|@|\bdoi\b)'     # URL-like
    r'|.*(?:19|20)\d{2}'                   # year
    r'|.*(?:pp?\.\s*\d|vol\.\s*\d|ed\.)'  # page/vol/ed
    r'|.*\bISBN\b'
    r'|.*\b[\w\s]+,\s*[\w\s]+\.'          # Author, Title.
    , re.I
)


def _is_bibliography_para(text: str) -> bool:
    """Heuristic: is this a bibliography/reference entry?"""
    stripped = text.strip()
    if len(stripped) < 10:
        return False
    return bool(_BIB_RE.match(stripped))


def _count_numbered_refs(paragraphs: List[str]) -> int:
    """Count paragraphs that look like numbered references."""
    count = 0
    for p in paragraphs:
        stripped = p.strip()
        # Simple heuristic: starts with number followed by space/tab/dot
        if re.match(r'^\d+[.\t\s]', stripped):
            count += 1
    return count


def check_language_consistency(
    target_paragraphs: List[str],
    target_language: str,
    max_wrong_pct: float = 15.0,
) -> List[str]:
    """
    Scan body paragraphs for text in the wrong language.
    Skips bibliography entries (they legitimately contain English source titles and URLs).
    Fails if more than `max_wrong_pct` of checkable paragraphs detect as non-target language.
    Returns list of failure messages.
    """
    fails: List[str] = []
    lang_code = _LANG_MAP.get(target_language, target_language)

    wrong: List[Tuple[int, str, str]] = []  # (index, detected_lang, text_preview)
    checkable = 0

    for i, para in enumerate(target_paragraphs):
        text = para.strip()
        if not text or len(text) < 30:
            continue  # skip empty / too short
        if _is_bibliography_para(text):
            continue  # skip bibliography

        checkable += 1
        try:
            detected = detect(text)
        except LangDetectException:
            continue

        if detected != lang_code:
            wrong.append((i, detected, text[:80]))

    if checkable == 0:
        return fails  # nothing to check

    wrong_pct = (len(wrong) / checkable) * 100
    if wrong_pct > max_wrong_pct:
        fails.append(
            f"LANGUAGE CHECK: {len(wrong)}/{checkable} paragraphs ({wrong_pct:.1f}%) "
            f"detected as wrong language (expected {target_language}). "
            f"First hits: " + "; ".join(
                f"para {idx} detected as {d}" for idx, d, _ in wrong[:3]
            )
        )
    return fails


def check_structural_integrity(
    source_paragraphs: List[str],
    target_paragraphs: List[str],
) -> List[str]:
    """
    Three sub-checks:
      1. Reference count: target should be 45-115% of source.
      2. Paragraph ratio: target should be 0.80-1.30 of source.
      3. Post-bibliography content: >5 substantive paragraphs after last ref = duplicated content glued on.
    Returns list of failure messages.
    """
    fails: List[str] = []

    src_refs = _count_numbered_refs(source_paragraphs)
    tgt_refs = _count_numbered_refs(target_paragraphs)

    # 1. Reference count
    if src_refs > 0:
        ratio = (tgt_refs / src_refs) * 100 if src_refs else 0
        if ratio < 45 or ratio > 115:
            fails.append(
                f"STRUCTURAL: Reference count mismatch. "
                f"Source has {src_refs} refs, target has {tgt_refs} ({ratio:.0f}%). "
                f"Allowed range: 45-115%."
            )

    # 2. Paragraph ratio
    src_len = len([p for p in source_paragraphs if p.strip()])
    tgt_len = len([p for p in target_paragraphs if p.strip()])
    if src_len > 0:
        para_ratio = tgt_len / src_len
        if para_ratio < 0.80 or para_ratio > 1.30:
            fails.append(
                f"STRUCTURAL: Paragraph ratio {para_ratio:.2f} outside 0.80-1.30 range. "
                f"Source: {src_len} paragraphs, Target: {tgt_len}."
            )

    # 3. Post-bibliography content
    if tgt_refs > 0:
        # Find last reference-looking paragraph
        last_ref_idx = -1
        for i in range(len(target_paragraphs) - 1, -1, -1):
            if re.match(r'^\d+[.\t\s]', target_paragraphs[i].strip()):
                last_ref_idx = i
                break

        if last_ref_idx >= 0:
            post_ref = target_paragraphs[last_ref_idx + 1:]
            substantial = [p for p in post_ref if len(p.strip()) > 100]
            if len(substantial) > 5:
                fails.append(
                    f"STRUCTURAL: {len(substantial)} substantial paragraphs found AFTER "
                    f"the last bibliography entry (index {last_ref_idx}). "
                    f"Likely duplicated content glued after bibliography."
                )

    return fails

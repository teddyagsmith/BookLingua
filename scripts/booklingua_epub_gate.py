#!/usr/bin/env python3
"""
BookLingua EPUB Gate — Comprehensive quality checks before Supabase storage.

Runs against every generated EPUB before delivery. Hard fail on any check.
Designed to be called from the EPUB builder pipeline (both local and Vercel).

Usage:
    from booklingua_epub_gate import check_epub
    fails = check_epub(epub_path, target_lang='de', template_path=None)
    if fails:
        raise ValueError(f"EPUB gate failed: {fails}")
"""

import re, zipfile, json, statistics
from pathlib import Path
from typing import List, Dict, Optional, Tuple

try:
    from langdetect import detect, LangDetectException
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False


# ─── Constants ───────────────────────────────────────────────────────────────

ARTIFACT_PATTERNS = [
    re.compile(r'===SEGMENT_\d+_(START|END)==='),
    re.compile(r'===TRANSLATION_NOTES==='),
    re.compile(r'"type"\s*:'),
    re.compile(r'P\d+\s*[:\-]\s*\S'),
]

EPILOGUE_SNEAK_PEEK_KEYWORDS = [
    'ADELANTO', 'ANTEPRIMA', 'VORSCHAU', 'FIREMAN', 'HALLIE', 'LESEPROBE',
]

TOC_MAX_WORDS = 10

SINGLE_P_MIN_WORDS = 500

OVERSIZED_MULTIPLIER = 3.0

SNEAK_PEEK_MIN_WORDS = 100


# ─── Helpers ───────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&\w+;', ' ', text)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _word_count(text: str) -> int:
    return len(text.split())


def _read_opf(epub_zf: zipfile.ZipFile) -> str:
    """Read content.opf from the EPUB."""
    # Find OPF path via container.xml
    container = epub_zf.read('META-INF/container.xml').decode('utf-8', errors='replace')
    m = re.search(r'full-path="([^"]+\.opf)"', container)
    opf_path = m.group(1) if m else 'OEBPS/content.opf'
    try:
        return epub_zf.read(opf_path).decode('utf-8', errors='replace')
    except KeyError:
        return ''


def _read_chapter_files(epub_zf: zipfile.ZipFile) -> List[Tuple[str, str]]:
    """Return list of (filename, xhtml_content) for all chapter_*.xhtml files in spine order."""
    # Read OPF spine order
    opf = _read_opf(epub_zf)
    spine_ids = re.findall(r'<itemref[^>]*idref="([^"]+)"', opf)
    manifest = {}
    for item in re.findall(r'<item\s+([^>]+)/?>', opf):
        id_m = re.search(r'id="([^"]+)"', item)
        href_m = re.search(r'href="([^"]+)"', item)
        if id_m and href_m:
            manifest[id_m.group(1)] = href_m.group(1)

    # Resolve spine hrefs to full paths
    opf_dir = 'OEBPS/'  # default
    chapters = []
    for sid in spine_ids:
        href = manifest.get(sid)
        if not href:
            continue
        # Skip non-chapter files
        if not re.match(r'chapter_\d+\.xhtml', href.split('/')[-1]):
            continue
        full_path = opf_dir + href if not href.startswith('OEBPS/') else href
        try:
            content = epub_zf.read(full_path).decode('utf-8', errors='replace')
            chapters.append((href.split('/')[-1], content))
        except KeyError:
            pass

    return chapters


# ─── Individual Checks ─────────────────────────────────────────────────────

def check_duplicate_headings(chapter_files: List[Tuple[str, str]]) -> List[str]:
    """1. Check that <h1> text does not appear at start of first <p>."""
    fails = []
    for fname, content in chapter_files:
        h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.DOTALL)
        if not h1_match:
            continue
        h1_text = _strip_html(h1_match.group(1)).strip()

        # Find first <p> after the <h1>
        first_p_match = re.search(r'<h1[^>]*>.*?</h1>\s*<p[^>]*>(.*?)</p>', content, re.DOTALL)
        if not first_p_match:
            continue
        p_text = _strip_html(first_p_match.group(1)).strip()

        if p_text.startswith(h1_text):
            fails.append(
                f"DUPLICATE HEADING: {fname} — <h1> '{h1_text[:50]}' also appears at start of first <p>"
            )
    return fails


def check_epilogue_swap(chapter_files: List[Tuple[str, str]]) -> List[str]:
    """2. Epilogue chapter must not contain sneak peek keywords."""
    fails = []
    for fname, content in chapter_files:
        h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.DOTALL)
        if not h1_match:
            continue
        h1_text = _strip_html(h1_match.group(1)).strip().upper()

        # Is this an epilogue chapter?
        if not re.search(r'EP[IÍ]LOG(UE|O)?', h1_text, re.I):
            continue

        # Read first 200 chars of body
        body_match = re.search(r'<h1[^>]*>.*?</h1>\s*<p[^>]*>(.*?)</p>', content, re.DOTALL)
        if not body_match:
            continue
        body_text = _strip_html(body_match.group(1))[:200].upper()

        for keyword in EPILOGUE_SNEAK_PEEK_KEYWORDS:
            if keyword in body_text:
                fails.append(
                    f"EPILOGUE SWAP: {fname} — epilogue body contains '{keyword}' "
                    f"(sneak peek content in epilogue slot). First 80 chars: {body_text[:80]}"
                )
                break  # only report once per chapter
    return fails


def check_single_paragraph(chapter_files: List[Tuple[str, str]]) -> List[str]:
    """3. Any chapter >500 words must have more than one <p> tag."""
    fails = []
    for fname, content in chapter_files:
        # Count <p> tags
        p_tags = re.findall(r'<p[^>]*>.*?</p>', content, re.DOTALL)
        if len(p_tags) <= 1:
            # Check word count
            all_text = _strip_html(content)
            wc = _word_count(all_text)
            if wc > SINGLE_P_MIN_WORDS:
                fails.append(
                    f"SINGLE PARAGRAPH: {fname} — {wc} words but only {len(p_tags)} <p> tag(s). "
                    f"Chapters over {SINGLE_P_MIN_WORDS} words need paragraph breaks."
                )
    return fails


def check_oversized_chapters(chapter_files: List[Tuple[str, str]]) -> List[str]:
    """4. No chapter >3x the average chapter word count."""
    word_counts = []
    for fname, content in chapter_files:
        body = re.sub(r'<h1[^>]*>.*?</h1>', '', content, flags=re.DOTALL)
        body = re.sub(r'<[^>]+>', '', body)
        wc = _word_count(body)
        word_counts.append((fname, wc))

    if len(word_counts) < 2:
        return []

    avg = statistics.mean(w[1] for w in word_counts)
    if avg == 0:
        return []

    fails = []
    for fname, wc in word_counts:
        if wc > avg * OVERSIZED_MULTIPLIER:
            fails.append(
                f"OVERSIZED: {fname} — {wc} words, {wc/avg:.1f}x average ({avg:.0f} words). "
                f"Max allowed: {OVERSIZED_MULTIPLIER}x average."
            )
    return fails


def check_pipeline_artifacts(epub_zf: zipfile.ZipFile) -> List[str]:
    """5. Scan all files for pipeline infrastructure markers."""
    fails = []
    found = []
    for info in epub_zf.infolist():
        if info.filename.endswith(('.xhtml', '.html', '.htm', '.css', '.opf')):
            try:
                text = epub_zf.read(info.filename).decode('utf-8', errors='replace')
            except Exception:
                continue
            for pattern in ARTIFACT_PATTERNS:
                if pattern.search(text):
                    found.append(f"{info.filename}: {pattern.pattern[:40]}")
                    break

    if found:
        fails.append(f"ARTIFACTS: {len(found)} files contain pipeline markers. " +
                     f"First 5: {found[:5]}")
    return fails


def check_language_metadata(epub_zf: zipfile.ZipFile, target_lang: str) -> List[str]:
    """6. <dc:language> AND xml:lang on <package> must match target language.
    This catches pandoc-generated EPUBs that default to en-US."""
    fails = []
    opf = _read_opf(epub_zf)

    # Normalise target
    normalized_target = target_lang.lower()
    if normalized_target == 'es-latam':
        normalized_target = 'es'

    # Check <dc:language>
    lang_match = re.search(r'<dc:language>([^<]+)</dc:language>', opf)
    if not lang_match:
        fails.append("LANGUAGE META: <dc:language> not found in content.opf")
    else:
        opf_lang = lang_match.group(1).strip().lower()
        # Accept both exact match and prefix match (e.g. 'de' matches 'de-DE')
        if not (opf_lang == normalized_target or opf_lang.startswith(normalized_target + '-')):
            fails.append(
                f"LANGUAGE META: <dc:language> is '{opf_lang}', expected '{normalized_target}'"
            )

    # Also check xml:lang on <package> element (catches pandoc en-US default)
    pkg_lang_match = re.search(r'<package[^>]+xml:lang=["\']([^"\']+)["\']', opf)
    if pkg_lang_match:
        pkg_lang = pkg_lang_match.group(1).strip().lower()
        if not (pkg_lang == normalized_target or pkg_lang.startswith(normalized_target + '-')):
            fails.append(
                f"LANGUAGE META: <package xml:lang> is '{pkg_lang}', expected '{normalized_target}'"
            )

    return fails


def check_toc_entries(epub_zf: zipfile.ZipFile) -> List[str]:
    """7. TOC entries must be <= 10 words."""
    fails = []
    try:
        toc = epub_zf.read('OEBPS/toc.xhtml').decode('utf-8', errors='replace')
    except KeyError:
        return fails

    # Find all <a> text in TOC
    entries = re.findall(r'<a[^>]*>(.*?)</a>', toc, re.DOTALL)
    for entry in entries:
        text = _strip_html(entry).strip()
        wc = _word_count(text)
        if wc > TOC_MAX_WORDS:
            fails.append(
                f"TOC ENTRY: '{text[:60]}' is {wc} words (max {TOC_MAX_WORDS}). "
                f"Body text may be leaking into TOC."
            )
    return fails


def check_language_spot(chapter_files: List[Tuple[str, str]], target_lang: str) -> List[str]:
    """8. Sample every 5th chapter, langdetect first long paragraph."""
    if not LANGDETECT_AVAILABLE:
        return []

    fails = []
    lang_map = {'de': 'de', 'it': 'it', 'es': 'es', 'fr': 'fr', 'pt': 'pt'}
    expected = lang_map.get(target_lang.lower(), target_lang.lower())

    # Sample every 5th chapter (1, 6, 11, 16, 21, ...)
    sampled = [chapter_files[i] for i in range(0, len(chapter_files), 5)]
    wrong = []

    for fname, content in sampled:
        # Find first long paragraph (>100 chars)
        paras = re.findall(r'<p[^>]*>(.*?)</p>', content, re.DOTALL)
        for p in paras:
            text = _strip_html(p).strip()
            if len(text) > 100:
                try:
                    detected = detect(text)
                    if detected != expected:
                        wrong.append(f"{fname}: detected {detected}, expected {expected}")
                except Exception:
                    pass
                break

    if wrong:
        fails.append(f"LANGUAGE SPOT CHECK: {len(wrong)} sampled chapters wrong language. " +
                     f"Details: {wrong[:3]}")
    return fails


def check_template_paragraph_count(
    chapter_files: List[Tuple[str, str]], template: Optional[dict]
) -> List[str]:
    """9. If template exists, each chapter's <p> count must match template."""
    if not template or 'chapters' not in template:
        return []

    fails = []
    template_chapters = template['chapters']

    for i, (fname, content) in enumerate(chapter_files):
        if i >= len(template_chapters):
            break

        actual_p = len(re.findall(r'<p[^>]*>.*?</p>', content, re.DOTALL))
        expected_p = template_chapters[i].get('para_count', 0)

        if actual_p != expected_p:
            fails.append(
                f"TEMPLATE PARAGRAPH MISMATCH: {fname} — {actual_p} <p> tags, "
                f"template expects {expected_p}."
            )
    return fails


def check_sneak_peek(chapter_files: List[Tuple[str, str]]) -> List[str]:
    """10. Sneak peek chapter must have >= 100 words."""
    fails = []
    for fname, content in chapter_files:
        h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.DOTALL)
        if not h1_match:
            continue
        h1_text = _strip_html(h1_match.group(1)).strip().upper()

        # Is this a sneak peek chapter?
        if not re.search(r'SNEAK|ADELANTO|ANTEPRIMA|VORSCHAU|LESEPROBE|PEEK|PREVIEW', h1_text):
            continue

        # Count words in body (excluding heading)
        body = re.sub(r'<h1[^>]*>.*?</h1>', '', content, flags=re.DOTALL)
        body = re.sub(r'<[^>]+>', '', body)
        wc = _word_count(body)

        if wc < SNEAK_PEEK_MIN_WORDS:
            fails.append(
                f"SNEAK PEEK TOO SHORT: {fname} — {wc} words (min {SNEAK_PEEK_MIN_WORDS}). "
                f"Sneak peek content may be missing or truncated."
            )
    return fails


# ─── Main Entry Point ──────────────────────────────────────────────────────

def check_epub(
    epub_path: str,
    target_lang: str = 'en',
    template_path: Optional[str] = None,
) -> List[str]:
    """
    Run all gate checks on an EPUB file.

    Args:
        epub_path: Path to the .epub file
        target_lang: Target language code (de, it, es, etc.)
        template_path: Optional path to structure template JSON

    Returns:
        List of failure strings. Empty list = all checks passed.
    """
    fails: List[str] = []

    # Load template if provided
    template: Optional[dict] = None
    if template_path and Path(template_path).exists():
        with open(template_path, 'r') as f:
            template = json.load(f)

    with zipfile.ZipFile(epub_path, 'r') as zf:
        chapter_files = _read_chapter_files(zf)

        # Run all checks
        fails.extend(check_duplicate_headings(chapter_files))
        fails.extend(check_epilogue_swap(chapter_files))
        fails.extend(check_single_paragraph(chapter_files))
        fails.extend(check_oversized_chapters(chapter_files))
        fails.extend(check_pipeline_artifacts(zf))
        fails.extend(check_language_metadata(zf, target_lang))
        fails.extend(check_toc_entries(zf))
        fails.extend(check_language_spot(chapter_files, target_lang))
        fails.extend(check_template_paragraph_count(chapter_files, template))
        fails.extend(check_sneak_peek(chapter_files))

    return fails


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <epub_path> [target_lang] [template_path]")
        sys.exit(1)

    epub = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else 'en'
    tmpl = sys.argv[3] if len(sys.argv) > 3 else None

    results = check_epub(epub, lang, tmpl)
    if results:
        print(f"EPUB GATE FAILED: {len(results)} check(s) failed")
        for r in results:
            print(f"  - {r}")
        sys.exit(1)
    else:
        print("EPUB GATE PASSED: all checks OK")
        sys.exit(0)

#!/usr/bin/env python3
"""
BookLingua delivery gate. Runs AFTER the AI is finished. It does not translate.

Key point about the translation notes:
The notes are written in ENGLISH on purpose, because the author is an English
speaker. So the gate must NOT treat the notes as untranslated text. The notes
must sit in a clearly bounded block:

    BookLingua Translation Notes          <- start heading (this exact phrase)
    ...the English notes...
    * * *                                 <- a divider line ends the notes

Everything inside that block is exempt from the English check. Everything after
the divider (the actual translated book) is still checked normally.

Usage:
  python3 booklingua_gate.py INPUT.docx OUTPUT.docx --mode clean  --lang fr
  python3 booklingua_gate.py INPUT.docx OUTPUT.docx --mode review --lang pl
"""
import sys, re, zipfile, argparse

# New gate additions (Step 4 from Pipeline Brief v2)
try:
    from booklingua_gate_additions import check_language_consistency, check_structural_integrity
    _GATE_ADDITIONS = True
except ImportError:
    _GATE_ADDITIONS = False

ENGLISH_MARKERS = set("""
the and that this these those with for you your they them their what which who
when where from have has were would should could about because there through
between during only such been being does did into another itself yourself
""".split())

ENTITY_DOUBLE = re.compile(r'&amp;(amp|apos|quot|lt|gt|#x?[0-9a-fA-F]+);')
SCAFFOLD_LINE = re.compile(r'^\s*(===[A-Z_0-9]+===|\*\*Segment\b.*|\*\*Chunk\b.*)\s*$')
DIVIDER       = re.compile(r'^[\s\*\u2022\u00b7\u2014\u2013\u2012\u2015\u2500-\u257F=~_.\-]{3,}$')
NOTES_START   = re.compile(r'^\s*(booklingua\s+translation\s+notes|translation\s+notes)\b', re.I)
CHAP_MARKER   = re.compile(r'^\s*###\s*CHAPTER\s*:\s*(.+?)\s*###\s*$', re.S)
CHAP_TITLE    = re.compile(r'^(Cap[ií]tulo|Chapter|Kapitel|Capitolo|Chapitre)\s+[\wÀ-ÿ]+\.?$', re.I)

def get_paras(xml): return re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)
def para_text(p):  return ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S))

def heading_texts(xml):
    out = []
    for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S):
        if re.search(r'w:val="Heading[12]"', p):
            out.append(''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S)).strip())
    return [h for h in out if h]

def decode_entities(xml):
    xml = xml.replace('&amp;apos;', "'").replace('&amp;quot;', '"')
    xml = xml.replace('&amp;lt;', '&lt;').replace('&amp;gt;', '&gt;')
    xml = re.sub(r'&amp;(#x?[0-9a-fA-F]+);', r'&\1;', xml)
    xml = xml.replace('&amp;amp;', '&amp;')
    return xml

def looks_citation(t):
    return ('http' in t) or bool(re.match(r'^\s*\d+[\.\s]', t)) or bool(re.search(r'\(20\d\d', t))

def is_english(t):
    if len(t) < 45 or looks_citation(t):
        return False
    words = re.findall(r"[A-Za-z']+", t.lower())
    return len({w for w in words if w in ENGLISH_MARKERS}) >= 3

def find_notes_zone(texts):
    """Return (exempt_indices_set, error_or_None, found_bool).
    Notes are recognised two ways:
      1) a 'Translation Notes' start phrase, ended by a divider line, or
      2) the block between the first two divider lines in the front matter."""
    # Case 1: explicit start phrase
    start = next((i for i, t in enumerate(texts) if NOTES_START.match(t.strip())), None)
    if start is not None:
        end = next((j for j in range(start + 1, len(texts)) if DIVIDER.match(texts[j].strip())), None)
        if end is None:
            return set(), "translation notes block has no end divider line", True
        return set(range(start, end + 1)), None, True
    # Case 2: notes wrapped in a pair of dividers near the top of the file
    front = min(len(texts), 45)
    dividers = [i for i in range(front) if DIVIDER.match(texts[i].strip())]
    if len(dividers) >= 2:
        return set(range(dividers[0], dividers[1] + 1)), None, True
    return set(), None, False

def highlight_ratio(xml):
    total = sum(len(t) for t in re.findall(r'<w:t[^>]*>(.*?)</w:t>', xml, re.S)) or 1
    hl = 0
    for r in re.findall(r'<w:r>.*?</w:r>', xml, re.S):
        if re.search(r'w:fill="(FFEB3B|FFFF00|FFF200|FFEB00|FFFF99)"', r):
            hl += sum(len(t) for t in re.findall(r'<w:t[^>]*>(.*?)</w:t>', r, re.S))
    return hl / total

def count_highlights(xml):
    h = len(re.findall(r'<w:highlight w:val="(?!none)[^"]+"', xml))
    s = len(re.findall(r'<w:shd[^>]*w:fill="(FFEB3B|FFFF00|FFF200|FFEB00|FFFF99)"', xml))
    return max(h, s)


# ── NEW CHECKS added after Ruth's QA findings ──────────────────────────────

def check_duplicate_sections(texts, threshold=0.97):
    """Detect wholesale duplicated sections (two translation passes left in file).
    Uses a high threshold and large window to avoid false positives from
    books with repeated structural elements (templates, recurring exercises).
    Only fires on near-identical large blocks close together in the document.
    """
    fails = []
    window = 40   # large block — must be a whole section to trigger
    step = 20
    n = len(texts)
    seen = set()
    for i in range(0, n - window * 2, step):
        block_a = ' '.join(texts[i:i+window]).lower()
        words_a = set(block_a.split())
        if len(words_a) < 100:
            continue  # skip short/sparse blocks
        # Only look nearby — duplicated passes are adjacent, not chapters apart
        for j in range(i + window, min(i + window * 3, n - window), step):
            if (i, j) in seen:
                continue
            block_b = ' '.join(texts[j:j+window]).lower()
            words_b = set(block_b.split())
            if len(words_b) < 100:
                continue
            overlap = len(words_a & words_b) / min(len(words_a), len(words_b))
            if overlap >= threshold:
                seen.add((i, j))
                fails.append(
                    f"likely duplicated section: paragraphs ~{i}-{i+window} "
                    f"and ~{j}-{j+window} are {int(overlap*100)}% similar — "
                    f"possible two translation passes left in file"
                )
                break
    return fails

def check_visible_translator_notes(texts):
    """Detect tool notes left in the body (e.g. [SEGMENTO INCOMPLETO...])."""
    patterns = [
        r'\[SEGMENTO INCOMPLETO',
        r'\[INCOMPLETE SEGMENT',
        r'\[NOTE TO TRANSLATOR',
        r'\[TRANSLATOR',
        r'el texto original termina de forma abrupta',
        r'Se requiere el texto fuente completo',
        r'requires? (the )?source text',
    ]
    found = []
    for i, p in enumerate(texts):
        for pat in patterns:
            if re.search(pat, p, re.IGNORECASE):
                found.append(f"visible translator note at paragraph ~{i}: {p[:80]!r}")
    return found

def check_stray_brackets(texts):
    """Detect paragraphs starting with stray ] characters."""
    found = [i for i, p in enumerate(texts) if p.lstrip().startswith(']')]
    if found:
        return [f"{len(found)} paragraph(s) start with stray ']' at positions: {found[:10]}"]
    return []

def check_terminology_consistency(texts, lang):
    """Check for known term inconsistencies per language."""
    fails = []
    if lang in ('es', 'es-es', 'es-latam'):
        colegio = sum(1 for p in texts if 'colegio' in p.lower())
        instituto = sum(1 for p in texts if 'instituto' in p.lower())
        if colegio > 0 and instituto > 0 and abs(colegio - instituto) < max(colegio, instituto):
            fails.append(
                f"inconsistent school terminology: 'colegio' x{colegio} vs "
                f"'instituto' x{instituto} — standardise to one term"
            )
    return fails

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--mode", choices=["clean", "review"], required=True)
    ap.add_argument("--lang", required=True)
    ap.add_argument("--min-paras", type=int, default=0, dest='min_paras', help='fail if fewer than N non-empty paragraphs (catches incomplete translations)')
    a = ap.parse_args()

    with zipfile.ZipFile(a.inp) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    fixes, fails = [], []

    # ---------- AUTO-FIX ----------
    n = len(ENTITY_DOUBLE.findall(xml))
    if n:
        xml = decode_entities(xml); fixes.append(f"decoded {n} over-escaped entities")
    converted = 0
    for p in get_paras(xml):
        m = CHAP_MARKER.match(para_text(p).strip())
        if m:
            title = m.group(1).strip()
            new_p = ('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
                     '<w:r><w:t xml:space="preserve">' + title + '</w:t></w:r></w:p>')
            xml = xml.replace(p, new_p, 1); converted += 1
    if converted:
        fixes.append(f"converted {converted} chapter markers to Heading 1")
    removed = 0
    for p in get_paras(xml):
        t = para_text(p).strip()
        if SCAFFOLD_LINE.match(t) or t.startswith("FINAL DOCX") or t.startswith("==="):
            xml = xml.replace(p, "", 1); removed += 1
    if removed:
        fixes.append(f"removed {removed} scaffolding/filename paragraphs")
    if a.mode == "review":
        banners = [p for p in get_paras(xml)
                   if re.search(r'REVIEW COPY|improvements highlighted', para_text(p))]
        for p in banners[1:]:
            xml = xml.replace(p, "", 1)
        if len(banners) > 1:
            fixes.append(f"merged {len(banners)} banners into 1")
        hl = count_highlights(xml)
        xml2 = re.sub(r'\b\d+\s+(editorial improvements|improvements)', f'{hl} \\1', xml)
        if xml2 != xml:
            fixes.append(f"set banner count to real highlight count ({hl})"); xml = xml2

    # ---------- VALIDATE ----------
    paras = get_paras(xml)
    texts = [para_text(p) for p in paras]

    # notes zone (exempt from English check); enforce structure
    exempt, notes_err, notes_found = find_notes_zone(texts)
    if notes_err:
        fails.append(notes_err)
    if a.mode == "review" and not notes_found:
        fails.append("review is missing the translation notes block "
                     "('BookLingua Translation Notes')")

    text_all = "\n".join(texts)
    for bad in ['===', '[[ORIGINAL', ']]', '**Segment', '**Chunk', 'FINAL DOCX', '###CHAPTER', '###']:
        if bad in text_all:
            fails.append(f"scaffolding still present: {bad!r}")
    if ENTITY_DOUBLE.search(xml) or re.search(r'&amp;(apos|quot);', xml):
        fails.append("entity codes still visible to the reader")

    title = next((para_text(p) for p in paras if 'w:val="Title"' in p), "")
    if 'FINAL DOCX' in title or not title.strip():
        fails.append(f"title missing or set to internal filename: {title[:40]!r}")

    # duplicated cover block: title text repeated in the top of the document
    if title.strip():
        top = [t.strip() for t in texts[:12]]
        if top.count(title.strip()) > 1:
            fails.append(f"cover/title block is duplicated ({top.count(title.strip())} copies at the top)")

    # untranslated English in the BODY only (notes zone exempt)
    eng = [texts[i].strip() for i in range(len(texts))
           if i not in exempt and is_english(texts[i].strip())]
    if eng:
        fails.append(f"{len(eng)} English paragraph(s) left in the book body, "
                     f"e.g. {eng[0][:65]!r}")

    if a.mode == "review" and count_highlights(xml) < 10:
        fails.append(f"review has only {count_highlights(xml)} highlights")
    if a.mode == "clean":
        h = len(re.findall(r'w:val="Heading[12]"', xml))
        if h < 5:
            fails.append(f"only {h} styled headings (structure likely lost)")

    # Headings must look like headings, not body/dialogue text. A heading is
    # suspicious if it reads like a full sentence or a run of dialogue: it ends
    # in a sentence-terminator and is reasonably long, it opens with a dialogue
    # dash, or it contains three or more sentence-ending marks (multiple
    # sentences strung together). Length alone and one-off repeats are NOT used
    # as signals: real books have long descriptive headings and sometimes repeat
    # a section title on purpose, so neither reliably indicates a problem.
    heads = heading_texts(xml)
    def looks_like_body(h):
        if 'http' in h:
            return False
        sentends = len(re.findall(r'[.!?]', h))
        return (h[-1:] in ('.', '!', '?') and len(h) > 20) or (h[:1] in ('\u2014', '\u2013')) or sentends >= 3
    suspicious = [h for h in heads if looks_like_body(h)]
    if suspicious:
        fails.append(f"{len(suspicious)} heading(s) look like body text, e.g. {suspicious[0][:55]!r}")

    # headings must not contain tab characters (sign of TOC copy-paste)
    toc_leaked = [h for h in heads if '\t' in h]
    if toc_leaked:
        fails.append(f"{len(toc_leaked)} heading(s) contain tab characters (copied from TOC, not body), "
                     f"e.g. {repr(toc_leaked[0][:55])}")

    # minimum paragraph count -- catches incomplete translations
    # Duplicate section detection
    dup_fails = check_duplicate_sections(texts)
    fails.extend(dup_fails)

    # Visible translator notes
    note_fails = check_visible_translator_notes(texts)
    fails.extend(note_fails)

    # Stray bracket artifacts
    bracket_fails = check_stray_brackets(texts)
    fails.extend(bracket_fails)

    # Terminology consistency
    term_fails = check_terminology_consistency(texts, a.lang)
    fails.extend(term_fails)

    # Step 4 additions: language consistency & structural integrity
    if _GATE_ADDITIONS:
        lang_fails = check_language_consistency(texts, a.lang)
        fails.extend(lang_fails)

    if a.min_paras and len(texts) < a.min_paras:
        fails.append(f"only {len(texts)} paragraphs; expected at least {a.min_paras} "
                     f"(translation may be incomplete)")

    # chapter titles that were not styled as headings (inconsistent look)
    head_set = set(heading_texts(xml))
    unstyled_ch = [texts[i].strip() for i in range(len(texts))
                   if CHAP_TITLE.match(texts[i].strip()) and texts[i].strip() not in head_set]
    if unstyled_ch:
        fails.append(f"{len(unstyled_ch)} chapter title(s) not styled as headings, "
                     f"e.g. {unstyled_ch[0][:40]!r}")

    # over-highlighting: whole paragraphs in yellow instead of the changed phrases
    if a.mode == "review":
        ratio = highlight_ratio(xml)
        if ratio > 0.20:
            fails.append(f"over-highlighting: {ratio*100:.0f}% of the text is yellow; "
                         f"highlight only the changed words, not whole paragraphs")

    # ---------- WRITE ----------
    with zipfile.ZipFile(a.inp) as zin, zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = xml.encode("utf-8") if item.filename == "word/document.xml" else zin.read(item.filename)
            zout.writestr(item, data)

    print(f"\n=== {a.inp}  [{a.mode}/{a.lang}] ===")
    for f in fixes: print(f"  auto-fixed: {f}")
    if not fixes: print("  auto-fixed: nothing needed")
    if exempt: print(f"  note: exempted {len(exempt)} translation-notes paragraphs from the English check")
    if fails:
        print("  RESULT: FAIL - do not deliver, regenerate")
        for f in fails: print(f"    - {f}")
        sys.exit(1)
    print("  RESULT: PASS - safe to deliver")
    sys.exit(0)

if __name__ == "__main__":
    main()
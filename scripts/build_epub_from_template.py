#!/usr/bin/env python3
"""
BookLingua Template-Based EPUB Builder

Reads a structural template (from booklingua_template.py) and a translated text file,
then builds a valid EPUB3 where paragraph counts and chapter boundaries exactly match
the template. No structure is ever derived from translated text.

Usage:
    python3 build_epub_from_template.py --template template.json \
        --translated translated.txt --output output.epub \
        --title "Book Title" --author "Author Name" --lang de
"""
import argparse, json, re, os, sys, zipfile, tempfile, shutil, uuid
from datetime import datetime
from zipfile import ZipFile

EPUB_CSS = """/* BookLingua EPUB Stylesheet */
body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.4; text-align: justify; margin: 0; padding: 0 1em; }
p { text-indent: 1.5em; margin: 0; orphans: 2; widows: 2; }
h1 { font-size: 22pt; font-weight: bold; text-align: center; margin-top: 2em; margin-bottom: 1em; page-break-before: always; page-break-after: avoid; text-indent: 0; }
h1 + p { text-indent: 0; }
.title { font-size: 28pt; font-weight: bold; text-align: center; margin-top: 30%; text-indent: 0; }
.author { font-size: 13pt; text-align: center; margin-top: 2em; text-indent: 0; }
.copyright { font-size: 9pt; text-align: center; margin-top: 40%; text-indent: 0; }
ol { list-style-type: none; padding: 0; }
li { margin: 0.5em 0; }
a { text-decoration: none; color: inherit; }
"""

# ─── Artifact Detection (gate check) ─────────────────────────────────────────

ARTIFACT_PATTERNS = [
    re.compile(r'"type"\s*:'),           # JSON type field
    re.compile(r'"index"\s*:'),          # JSON index field
    re.compile(r'P\d+\s*[:\-]\s*'),     # Paragraph numbering like P1:, P2-
    re.compile(r'###SEGMENT\d+'),         # Segment markers
    re.compile(r'===TEMPLATE'),           # Template markers
    re.compile(r'\{\s*"chapters"'),      # JSON chapter array
]

def check_for_artifacts(text: str) -> list:
    """Scan text for template artifacts. Returns list of found patterns."""
    found = []
    for pattern in ARTIFACT_PATTERNS:
        if pattern.search(text):
            found.append(pattern.pattern)
    return found


# ─── Text Processing ─────────────────────────────────────────────────────────

def strip_pipeline_markers(text: str) -> str:
    """Remove all pipeline infrastructure markers from text."""
    text = re.sub(r'===\w[\w_]*===\n?', '', text)
    text = re.sub(r'\[\[ORIGINAL:[^\]]*\]\]', '', text)
    text = re.sub(r'###CHAPTER:[^#]*###\n?', '', text)
    text = re.sub(r'###H[1-6]:[^#]*###\n?', '', text)
    text = re.sub(r'###SEGMENT:\d+:\w+:\d+###\n?', '', text)
    text = re.sub(r'===SEGMENT_\d+_(START|END)===\n?', '', text)
    text = re.sub(r'P\d+\s*[:\-]\s*', '', text)  # Strip P1:, P2- numbering
    return text.strip()


def split_into_sentences(text: str) -> list:
    """Split text into sentences, preserving dialogue."""
    # Match sentence endings that are followed by space and uppercase
    # But be careful with abbreviations (Mr., Mrs., Dr., etc.)
    sentences = re.split(
        r'(?<=[.!?»""\'\'])\s+(?=[A-ZÄÖÜÉÈÀÌÍ""''\u00AB])',
        text
    )
    return [s.strip() for s in sentences if s.strip()]


def distribute_sentences(text: str, n_paras: int, target_words_per_para: list = None) -> list:
    """
    Distribute text across exactly n_paras paragraphs.
    If target_words_per_para is provided, try to match those lengths.
    """
    text = text.strip()
    if not text:
        return [''] * n_paras

    sentences = split_into_sentences(text)
    if not sentences:
        return [''] * n_paras

    if len(sentences) <= n_paras:
        # Not enough sentences — some paragraphs will be empty or short
        result = list(sentences)
        while len(result) < n_paras:
            result.append('')
        return result[:n_paras]

    # Distribute sentences roughly evenly
    result = []
    step = len(sentences) / n_paras
    for i in range(n_paras):
        start = int(i * step)
        end = int((i + 1) * step) if i < n_paras - 1 else len(sentences)
        result.append(' '.join(sentences[start:end]))

    return result


# ─── Chapter Extraction from Translated Text ─────────────────────────────────

def fix_dropcap(text: str) -> str:
    """Remove drop-cap spacing artifacts: 'D as ist' → 'Das ist', 'W affles' → 'Waffles'."""
    # Only at start of paragraph (after stripping heading)
    # Pattern: word-boundary, single uppercase, space, then lowercase continuation
    # Guard: must not be a known standalone Italian/Spanish article (I, A)
    # to avoid "I baci" → "Ibaci" (Italian: "the kisses")
    lines = text.split('\n')
    fixed = []
    for line in lines:
        # Only fix at start of a non-empty line (paragraph opening)
        m = re.match(r'^([A-ZÄÖÜ]) ([a-zäöüáéíóúñ])', line)
        if m:
            letter = m.group(1)
            # Skip 'I' only — Italian plural article (I baci = the kisses)
            if letter not in ('I',):
                line = letter + line[2:]  # remove the space
        fixed.append(line)
    return '\n'.join(fixed)


def extract_chapters_from_translation(translated_text: str, template: dict) -> list:
    """
    Split translated text into chapters matching the template's chapter count.
    Uses heading detection + source word counts as guides.
    """
    # Numbered chapter headings (KAPITEL 1 LILY, CAPITOLO 2 GAGE, etc.)
    heading_pattern = re.compile(
        r'^\s*(KAPITEL|CAPITOLO|CAP[IÍ]TULO|CHAPTER)\s+(\d+)(?:\s+([A-Z][A-Z]+))?',
        re.I | re.M
    )
    # Epilogue — in any language
    epilog_pattern = re.compile(
        r'^\s*(EP[IÍ]LOG(?:UE|O|UO)?)(?:\s+([A-Z][A-Z]+))?',
        re.I | re.M
    )
    # Sneak peek — English or localized (ADELANTO, ANTEPRIMA, LESEPROBE, VORSCHAU)
    sneak_pattern = re.compile(
        r'^\s*(SNEAK\s*PE[EA]K|ADELANTO|ANTEPRIMA|LESEPROBE|VORSCHAU)(?:\s+([A-Z][A-Z]+))?',
        re.I | re.M
    )

    all_headings = []

    for m in heading_pattern.finditer(translated_text):
        all_headings.append({
            'pos': m.start(),
            'type': 'chapter',
            'num': int(m.group(2)),
            'heading': m.group(0).strip(),
            'pov': m.group(3) or '',
        })

    for m in epilog_pattern.finditer(translated_text):
        all_headings.append({
            'pos': m.start(),
            'type': 'epilog',
            'num': 999,
            'heading': m.group(0).strip(),
            'pov': m.group(2) or '',
        })

    for m in sneak_pattern.finditer(translated_text):
        all_headings.append({
            'pos': m.start(),
            'type': 'sneak',
            'num': 1000,
            'heading': m.group(0).strip(),
            'pov': m.group(2) or '',
        })

    all_headings.sort(key=lambda x: x['pos'])

    # Deduplicate — by number for chapters, by heading text for unnumbered
    seen_nums:     set = set()
    seen_headings: set = set()
    unique_headings = []
    for h in all_headings:
        if h['type'] == 'chapter':
            if h['num'] in seen_nums:
                continue
            seen_nums.add(h['num'])
        else:
            key = h['heading'].upper()[:30]
            if key in seen_headings:
                continue
            seen_headings.add(key)
        unique_headings.append(h)

    # Extract content for each chapter
    chapters = []
    for i, h in enumerate(unique_headings):
        start = h['pos']
        end = unique_headings[i + 1]['pos'] if i + 1 < len(unique_headings) else len(translated_text)
        content = translated_text[start:end].strip()

        # FIX: Strip the heading PREFIX only (not the entire first line).
        # Previously used first_nl which removed heading + inline body when
        # they were on the same line (all three languages have this pattern).
        heading_text = h['heading']
        if content.startswith(heading_text):
            content = content[len(heading_text):].strip()
        else:
            # Fallback: strip first line if heading not found at start
            first_nl = content.find('\n')
            if first_nl > 0:
                content = content[first_nl:].strip()

        # Fix drop-cap spacing artifacts
        content = fix_dropcap(content)

        chapters.append({
            'heading': h['heading'],
            'pov': h['pov'],
            'content': content,
        })

    return chapters


def map_chapters_to_template(translated_chapters: list, template: dict) -> list:
    """
    Map extracted translated chapters to template chapters.
    Uses template word counts to detect and truncate oversized chapters.
    Returns list of {heading, paragraphs} dicts.
    """
    template_chapters = template['chapters']

    # Calculate language expansion factor from well-matched chapters
    good_ratios = []
    for i, t_ch in enumerate(template_chapters):
        if i < len(translated_chapters):
            tr_words = len(translated_chapters[i]['content'].split())
            src_words = t_ch['word_count']
            if src_words > 0:
                ratio = tr_words / src_words
                if 0.7 < ratio < 1.5:
                    good_ratios.append(ratio)

    lang_factor = sum(good_ratios) / len(good_ratios) if good_ratios else 1.0
    print(f"  Language expansion factor: {lang_factor:.3f}")

    result = []
    for i, t_ch in enumerate(template_chapters):
        if i < len(translated_chapters):
            tr_ch = translated_chapters[i]
            content = strip_pipeline_markers(tr_ch['content'])
            n_paras = t_ch['para_count']

            # FIX 1: Use translated heading (includes chapter number) when available
            translated_heading = tr_ch.get('heading', '').strip()
            template_heading = t_ch['heading'].strip()
            if translated_heading and len(translated_heading) > len(template_heading):
                heading = translated_heading
            else:
                heading = template_heading

            # Check for oversized content (duplicate content leaked in)
            tr_words = len(content.split())
            expected_words = int(t_ch['word_count'] * lang_factor)
            ratio = tr_words / expected_words if expected_words > 0 else 1.0

            flag = ''
            if ratio > 1.5:
                print(f"  ch{i+1} {heading[:30]:30} OVERSIZED: {tr_words} words, truncating to ~{expected_words}")
                words = content.split()
                content = ' '.join(words[:expected_words])

            # Distribute content across required paragraph count
            paragraphs = distribute_sentences(content, n_paras)

            result.append({
                'heading': heading,
                'paragraphs': paragraphs,
            })
        else:
            # FIX 2: Missing chapter — use English content from template for back-matter
            english_paras = [p['text'] for p in t_ch['paragraphs'] if p['text'].strip()]
            if english_paras:
                english_words = sum(len(p.split()) for p in english_paras)
                print(f"  ch{i+1} {t_ch['heading'][:30]:30} MISSING — using English "
                      f"content ({english_words} words, {len(english_paras)} paras)")
                result.append({
                    'heading': t_ch['heading'],
                    'paragraphs': english_paras,
                })
            else:
                # Missing chapter — create empty placeholders
                result.append({
                    'heading': t_ch['heading'],
                    'paragraphs': [''] * t_ch['para_count'],
                })

    return result


# ─── EPUB Builder ────────────────────────────────────────────────────────────

def build_epub(chapters: list, title: str, author: str, output_path: str, lang: str = 'en'):
    """Build a valid EPUB3 from chapter data."""
    tmpdir = tempfile.mkdtemp()
    try:
        # mimetype
        with open(os.path.join(tmpdir, 'mimetype'), 'w') as f:
            f.write('application/epub+zip')

        # container.xml
        os.makedirs(os.path.join(tmpdir, 'META-INF'))
        with open(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'w') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
                    '  <rootfiles>\n'
                    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'
                    '  </rootfiles>\n</container>')

        oebps = os.path.join(tmpdir, 'OEBPS')
        os.makedirs(oebps)

        # CSS
        with open(os.path.join(oebps, 'content.css'), 'w') as f:
            f.write(EPUB_CSS)

        # Front matter
        for fid, fname, body in [
            ('title_page', 'title_page.xhtml', f'<h1 class="title">{title}</h1>'),
            ('copyright',  'copyright.xhtml',  f'<p class="copyright">Copyright \u00a9 2023</p>'),
        ]:
            with open(os.path.join(oebps, fname), 'w') as f:
                f.write(_xhtml(fid.replace('_',' ').title(), body, lang))

        # TOC with localized heading
        toc_headings = {
            'de': 'Inhaltsverzeichnis',
            'it': 'Indice',
            'es': 'Tabla de contenidos',
            'fr': 'Table des matières',
            'pt': 'Índice',
        }
        toc_heading = toc_headings.get(lang, 'Table of Contents')
        items = '\n'.join(f'    <li><a href="chapter_{i+1:03d}.xhtml">{ch["heading"]}</a></li>'
                          for i, ch in enumerate(chapters))
        with open(os.path.join(oebps, 'toc.xhtml'), 'w') as f:
            f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}">
<head><title>{toc_heading}</title><link rel="stylesheet" href="content.css"/></head>
<body>
<h1>{toc_heading}</h1>
<nav epub:type="toc"><ol>
{items}
</ol></nav>
</body></html>''')

        # Chapter files
        ch_files = []
        for i, ch in enumerate(chapters):
            fname = f'chapter_{i+1:03d}.xhtml'
            safe_h = ch['heading'].replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

            # Build paragraph HTML
            body_html = ''
            for p in ch['paragraphs']:
                if p.strip():
                    body_html += f'<p>{p}</p>\n'
            if not body_html:
                body_html = '<p></p>\n'

            xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head><title>{safe_h}</title><link rel="stylesheet" href="content.css"/></head>
<body>
<h1>{safe_h}</h1>
{body_html}</body></html>'''

            with open(os.path.join(oebps, fname), 'w') as f:
                f.write(xhtml)
            ch_files.append(fname)

        # OPF
        book_id = str(uuid.uuid4())
        modified = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')

        all_items = [
            ('title_page', 'title_page.xhtml', 'application/xhtml+xml', None),
            ('copyright',  'copyright.xhtml',  'application/xhtml+xml', None),
            ('toc',        'toc.xhtml',         'application/xhtml+xml', 'nav'),
        ] + [(f'ch_{i+1}', f, 'application/xhtml+xml', None) for i, f in enumerate(ch_files)] \
          + [('css', 'content.css', 'text/css', None)]

        manifest = '\n    '.join(
            f'<item id="{id_}" href="{href}" media-type="{mt}"'
            + (f' properties="{prop}"' if prop else '') + '/>'
            for id_, href, mt, prop in all_items)
        spine = '\n    '.join(f'<itemref idref="{id_}"/>' for id_, *_ in all_items
                              if _ and _[1] != 'text/css')

        with open(os.path.join(oebps, 'content.opf'), 'w') as f:
            f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:{book_id}</dc:identifier>
    <dc:title>{title.replace("&","&amp;")}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>{lang}</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    {manifest}
  </manifest>
  <spine>
    {spine}
  </spine>
</package>''')

        # Zip
        with ZipFile(output_path, 'w') as zf:
            zf.write(os.path.join(tmpdir, 'mimetype'), 'mimetype', compress_type=zipfile.ZIP_STORED)
            zf.write(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'META-INF/container.xml')
            zf.write(os.path.join(oebps, 'content.opf'),         'OEBPS/content.opf')
            zf.write(os.path.join(oebps, 'toc.xhtml'),           'OEBPS/toc.xhtml')
            zf.write(os.path.join(oebps, 'title_page.xhtml'),    'OEBPS/title_page.xhtml')
            zf.write(os.path.join(oebps, 'copyright.xhtml'),     'OEBPS/copyright.xhtml')
            zf.write(os.path.join(oebps, 'content.css'),         'OEBPS/content.css')
            for f in ch_files:
                zf.write(os.path.join(oebps, f), f'OEBPS/{f}')
    finally:
        shutil.rmtree(tmpdir)


def _xhtml(title, body, lang):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head><title>{title}</title><link rel="stylesheet" href="content.css"/></head>
<body>
{body}
</body></html>'''


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Build EPUB from template + translated text')
    parser.add_argument('--template',   required=True, help='Path to template JSON')
    parser.add_argument('--translated', required=True, help='Path to translated text file')
    parser.add_argument('--output',     required=True, help='Output EPUB path')
    parser.add_argument('--title',      default='Untitled', help='Book title')
    parser.add_argument('--author',     default='Unknown', help='Author name')
    parser.add_argument('--lang',       default='en', help='Language code (de, it, es, etc.)')
    args = parser.parse_args()

    # Load template
    with open(args.template, 'r') as f:
        template = json.load(f)

    # Load translated text
    with open(args.translated, 'r', encoding='utf-8') as f:
        translated_text = f.read()

    # Gate check: scan for artifacts
    artifacts = check_for_artifacts(translated_text)
    if artifacts:
        print(f"ERROR: Template artifacts found in translated text:")
        for a in artifacts:
            print(f"  - {a}")
        sys.exit(1)

    print(f"Template: {template['total_chapters']} chapters, {template['total_paragraphs']} paragraphs")

    # Extract chapters from translated text
    translated_chapters = extract_chapters_from_translation(translated_text, template)
    print(f"Detected {len(translated_chapters)} chapters in translated text")

    # Map to template structure
    mapped_chapters = map_chapters_to_template(translated_chapters, template)
    print(f"Mapped to {len(mapped_chapters)} template chapters")

    # Verify paragraph counts match template
    for i, (mc, tc) in enumerate(zip(mapped_chapters, template['chapters'])):
        if len(mc['paragraphs']) != tc['para_count']:
            print(f"WARNING: ch{i+1} has {len(mc['paragraphs'])} paragraphs, expected {tc['para_count']}")

    # Build EPUB
    build_epub(mapped_chapters, args.title, args.author, args.output, args.lang)
    size = os.path.getsize(args.output)
    print(f"Built: {args.output} ({size:,} bytes)")

    # Validate
    import subprocess
    result = subprocess.run(['epubcheck', args.output], capture_output=True, text=True)
    if '0 fatals' in result.stdout and '0 errors' in result.stdout:
        print("epubcheck: PASS (0 fatals, 0 errors)")
    else:
        print("epubcheck output:")
        print(result.stdout)
        print(result.stderr)


if __name__ == '__main__':
    main()

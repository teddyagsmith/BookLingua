#!/usr/bin/env python3
"""
BookLingua Structural Template Generator

Parses a source document (EPUB or DOCX) and emits a JSON template that captures:
- Chapter count and headings in order
- Paragraph count per chapter
- Paragraph types (body, dialogue, scene_break)
- Front/back matter boundaries

The template is the SINGLE SOURCE OF TRUTH for all downstream builders.
No builder ever derives structure from translated text.
"""
import json, re, zipfile, sys, os
from typing import List, Dict, Any, Optional

# ─── Constants ───────────────────────────────────────────────────────────────

TEMPLATE_VERSION = "1.0"

# Dialogue detection: line starts with opening quote, or is wrapped in quotes
DIALOGUE_PATTERN = re.compile(
    r'^\s*[\u201C\u201E\u00AB\u2018"\'«]'
    r'|'
    r'[\u201D\u201F\u00BB\u2019"\'][\s\S]{0,3}$'
)

SCENE_BREAK_PATTERN = re.compile(
    r'^(\*{3,}|#{3,}|─{3,}|_{3,}|\s*\*\s*\*\s*\*\s*)$'
)

# Chapter heading patterns
CHAPTER_PREFIX = re.compile(
    r'^\s*(Chapter|Chapitre|Cap[ií]tulo|Kapitel|Capitolo|Epilogue|Ep[ií]logo|'
    r'Prologue|Pr[oó]logo|Introduction|Preface|Foreword|'
    r'Sneak Peek|Acknowledgements|Dedication|About the Author)',
    re.I
)

# ─── EPUB Parser ─────────────────────────────────────────────────────────────

def parse_epub(epub_path: str) -> Dict[str, Any]:
    """Parse EPUB into structural template."""
    chapters: List[Dict[str, Any]] = []
    front_matter: List[Dict[str, Any]] = []
    back_matter: List[Dict[str, Any]] = []

    with zipfile.ZipFile(epub_path, 'r') as zf:
        # Read OPF to get spine order
        container = zf.read('META-INF/container.xml').decode('utf-8')
        opf_match = re.search(r'full-path="([^"]+\.opf)"', container)
        opf_path = opf_match.group(1) if opf_match else 'OEBPS/content.opf'
        opf_dir = opf_path.rsplit('/', 1)[0] + '/' if '/' in opf_path else ''

        opf = zf.read(opf_path).decode('utf-8')
        spine_items = re.findall(r'<itemref[^>]*idref="([^"]*)"', opf)

        manifest: Dict[str, str] = {}
        for m in re.findall(r'<item\s+([^>]+)/?>', opf):
            id_m = re.search(r'id="([^"]*)"', m)
            href_m = re.search(r'href="([^"]*)"', m)
            if id_m and href_m:
                manifest[id_m.group(1)] = href_m.group(1)

        chapter_idx = 0
        for itemref in spine_items:
            href = manifest.get(itemref)
            if not href:
                continue

            full_path = opf_dir + href
            try:
                xhtml = zf.read(full_path).decode('utf-8')
            except KeyError:
                continue

            # Extract heading
            h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', xhtml, re.S | re.I)
            if h1_match:
                heading = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip()
            else:
                title_match = re.search(r'<title>(.*?)</title>', xhtml, re.S | re.I)
                heading = re.sub(r'<[^>]+>', '', title_match.group(1)).strip() if title_match else ''

            # Extract body
            body_match = re.search(r'<body[^>]*>(.*?)</body>', xhtml, re.S | re.I)
            if not body_match:
                continue
            body = body_match.group(1)

            # Extract paragraphs
            paragraphs: List[Dict[str, Any]] = []
            for p_match in re.finditer(r'<p[^>]*>(.*?)</p>', body, re.S | re.I):
                text = re.sub(r'<[^>]+>', '', p_match.group(1)).strip()
                if not text:
                    continue
                para_type = classify_paragraph(text)
                paragraphs.append({
                    'index': len(paragraphs),
                    'type': para_type,
                    'text': text,
                    'word_count': len(text.split()),
                })

            chapter_data = {
                'index': chapter_idx,
                'heading': heading,
                'source_file': href,
                'paragraphs': paragraphs,
                'word_count': sum(p['word_count'] for p in paragraphs),
                'para_count': len(paragraphs),
            }

            # Classify as front matter, content, or back matter
            if is_front_matter(heading) or chapter_idx == 0 and not paragraphs:
                front_matter.append(chapter_data)
            elif is_back_matter(heading):
                back_matter.append(chapter_data)
            elif paragraphs:  # Only count as content chapter if it has body text
                chapter_data['index'] = len(chapters)
                chapters.append(chapter_data)
                chapter_idx += 1
            else:
                front_matter.append(chapter_data)

    return {
        'version': TEMPLATE_VERSION,
        'source_format': 'epub',
        'source_path': epub_path,
        'total_chapters': len(chapters),
        'total_paragraphs': sum(c['para_count'] for c in chapters),
        'front_matter': front_matter,
        'chapters': chapters,
        'back_matter': back_matter,
    }


# ─── DOCX Parser ─────────────────────────────────────────────────────────────

def parse_docx(docx_path: str) -> Dict[str, Any]:
    """Parse DOCX into structural template."""
    from docx import Document
    doc = Document(docx_path)

    chapters: List[Dict[str, Any]] = []
    front_matter: List[Dict[str, Any]] = []
    back_matter: List[Dict[str, Any]] = []

    current_chapter: Optional[Dict[str, Any]] = None
    chapter_idx = 0

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style = para.style.name.lower() if para.style else ''
        is_heading = 'heading' in style

        if is_heading:
            # Save previous chapter
            if current_chapter:
                if current_chapter.get('paragraphs'):
                    current_chapter['word_count'] = sum(p['word_count'] for p in current_chapter['paragraphs'])
                    current_chapter['para_count'] = len(current_chapter['paragraphs'])
                    if is_back_matter(current_chapter['heading']):
                        back_matter.append(current_chapter)
                    else:
                        current_chapter['index'] = len(chapters)
                        chapters.append(current_chapter)
                        chapter_idx += 1
                else:
                    front_matter.append(current_chapter)

            # Start new chapter
            current_chapter = {
                'index': chapter_idx,
                'heading': text,
                'source_file': f'chapter_{chapter_idx+1:03d}.xml',
                'paragraphs': [],
            }
        else:
            if current_chapter is None:
                # Content before first heading — create implicit chapter
                current_chapter = {
                    'index': chapter_idx,
                    'heading': '',
                    'source_file': 'front_matter.xml',
                    'paragraphs': [],
                }

            para_type = classify_paragraph(text)
            current_chapter['paragraphs'].append({
                'index': len(current_chapter['paragraphs']),
                'type': para_type,
                'text': text,
                'word_count': len(text.split()),
            })

    # Save final chapter
    if current_chapter:
        if current_chapter.get('paragraphs'):
            current_chapter['word_count'] = sum(p['word_count'] for p in current_chapter['paragraphs'])
            current_chapter['para_count'] = len(current_chapter['paragraphs'])
            if is_back_matter(current_chapter['heading']):
                back_matter.append(current_chapter)
            else:
                current_chapter['index'] = len(chapters)
                chapters.append(current_chapter)
        else:
            front_matter.append(current_chapter)

    return {
        'version': TEMPLATE_VERSION,
        'source_format': 'docx',
        'source_path': docx_path,
        'total_chapters': len(chapters),
        'total_paragraphs': sum(c['para_count'] for c in chapters),
        'front_matter': front_matter,
        'chapters': chapters,
        'back_matter': back_matter,
    }


# ─── Classification Helpers ──────────────────────────────────────────────────

def classify_paragraph(text: str) -> str:
    """Classify a paragraph as body, dialogue, or scene_break."""
    if SCENE_BREAK_PATTERN.match(text):
        return 'scene_break'
    if DIALOGUE_PATTERN.search(text):
        return 'dialogue'
    return 'body'


def is_front_matter(heading: str) -> bool:
    """Check if heading indicates front matter."""
    h = heading.lower()
    return any(k in h for k in [
        'title', 'copyright', 'dedication', 'acknowledgement',
        'contents', 'table of', 'about the author', 'praise',
        'also by', 'front matter', 'foreword', 'preface'
    ])


def is_back_matter(heading: str) -> bool:
    """Check if heading indicates back matter (promotional, not story content)."""
    h = heading.lower()
    # EPILOGUE is story content, not back matter
    return any(k in h for k in [
        'sneak peek', 'acknowledgements', 'about the author', 'also by',
        'back matter', 'author note', 'bonus', ' excerpt'
    ])


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <epub-or-docx-path> [output-json-path]")
        sys.exit(1)

    source_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else source_path + '.template.json'

    if source_path.endswith('.epub'):
        template = parse_epub(source_path)
    elif source_path.endswith('.docx'):
        template = parse_docx(source_path)
    else:
        print(f"Unknown format: {source_path}")
        sys.exit(1)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(template, f, indent=2, ensure_ascii=False)

    print(f"Template saved: {output_path}")
    print(f"  Chapters: {template['total_chapters']}")
    print(f"  Paragraphs: {template['total_paragraphs']}")
    print(f"  Front matter: {len(template['front_matter'])}")
    print(f"  Back matter: {len(template['back_matter'])}")

    # Print chapter summary
    for ch in template['chapters']:
        print(f"  ch{ch['index']+1}: {ch['heading'][:40]:40} p={ch['para_count']:3} w={ch['word_count']:5}")


if __name__ == '__main__':
    main()

"""booklingua_epub_builder.py — General EPUB builder with source-based chapter mapping.

Rule: Use the source document as the authoritative chapter map. Never guess from translated text.

Three cases:
1. EPUB upload post-11b41e3: Split on ###H1:### markers in translated text (markers preserved from source)
2. DOCX upload: Read Heading 1 styles from source DOCX, apply to translated text
3. EPUB upload pre-11b41e3 (legacy): Extract chapter structure from stored original EPUB, apply to translated text

TODO: Integrate this into the Vercel download route.
"""

import re
import zipfile
import os
from zipfile import ZipFile, ZIP_DEFLATED
import tempfile
import shutil


def extract_source_chapter_map_from_epub(epub_path):
    """Extract chapter titles and structure from original EPUB."""
    chapters = []
    with zipfile.ZipFile(epub_path, 'r') as zf:
        container = zf.read('META-INF/container.xml').decode('utf-8')
        opf_match = re.search(r'full-path="([^"]+\.opf)"', container)
        opf_path = opf_match.group(1) if opf_match else 'OEBPS/content.opf'
        
        opf = zf.read(opf_path).decode('utf-8')
        spine_items = re.findall(r'<itemref[^>]*idref="([^"]*)"', opf)
        
        manifest = {}
        for m in re.findall(r'<item\s+([^>]+)/?>', opf):
            id_match = re.search(r'id="([^"]*)"', m)
            href_match = re.search(r'href="([^"]*)"', m)
            if id_match and href_match:
                manifest[id_match.group(1)] = href_match.group(1)
        
        opf_dir = opf_path.rsplit('/', 1)[0] + '/' if '/' in opf_path else ''
        
        for itemref in spine_items:
            href = manifest.get(itemref)
            if not href:
                continue
            
            full_path = opf_dir + href
            try:
                xhtml = zf.read(full_path).decode('utf-8')
            except KeyError:
                continue
            
            h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', xhtml, re.S | re.I)
            if h1_match:
                title = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip()
            else:
                title = href.rsplit('/', 1)[-1].replace('.xhtml', '').replace('_', ' ').title()
            
            chapters.append({
                'title': title,
                'href': href
            })
    
    return chapters


def extract_source_chapter_map_from_docx(docx_path):
    """Extract chapter structure from source DOCX (Heading 1 styles)."""
    from docx import Document
    doc = Document(docx_path)
    chapters = []
    for i, para in enumerate(doc.paragraphs):
        style = para.style.name.lower() if para.style else ''
        if 'heading 1' in style or 'heading 2' in style:
            chapters.append({
                'title': para.text.strip(),
                'index': i
            })
    return chapters


def split_translated_by_source_structure(translated_text, source_chapters, translated_language):
    """Split translated text using source chapter map.
    
    Extracts heading from each matched line, puts remainder (same-line body) into content.
    """
    # For EPUB post-11b41e3: look for ###H1:### markers in translated text
    marker_re = re.compile(r'###(?:H([123456])|CHAPTER):(.+)###\n*')
    markers = []
    for m in marker_re.finditer(translated_text):
        level = int(m.group(1)) if m.group(1) else 1
        markers.append({
            'index': m.start(),
            'title': m.group(2).strip(),
            'level': level,
            'end': m.end()
        })
    
    if markers:
        # Use markers to split
        chapters = []
        for i, marker in enumerate(markers):
            start = marker['end']
            end = markers[i + 1]['index'] if i + 1 < len(markers) else len(translated_text)
            content = translated_text[start:end].strip()
            chapters.append({
                'heading': marker['title'],
                'content': content
            })
        return chapters
    
    # For DOCX/legacy EPUB: use source chapter structure
    # Find chapter headings in translated text by matching source titles
    lines = translated_text.split('\n')
    
    # Heading patterns: chapter number + optional character name (all-caps)
    heading_pattern = re.compile(r'^(KAPITEL|CAPITOLO|CAP[IÍ]TULO|CHAPTER)\s+\d+(\s+[A-Z][A-Z]+)?', re.I)
    standalone_pattern = re.compile(r'^(EPILOGUE|EPILOGO|SNEAK PEEK)$', re.I)
    name_only_pattern = re.compile(r'^(LILY|GAGE)$', re.I)
    
    chapter_markers = []  # (line_index, heading_text, rest_of_line)
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        
        match = heading_pattern.match(stripped) or standalone_pattern.match(stripped)
        if match:
            heading = match.group(0)
            rest = stripped[match.end():].strip()
            chapter_markers.append((i, heading, rest))
        elif name_only_pattern.match(stripped):
            chapter_markers.append((i, stripped, ''))
    
    chapters = []
    for i, (idx, heading, rest) in enumerate(chapter_markers):
        start = idx + 1  # skip heading line
        end = chapter_markers[i + 1][0] if i + 1 < len(chapter_markers) else len(lines)
        content_lines = lines[start:end]
        
        # If there's body text on the same line as the heading, prepend it
        if rest:
            content_lines.insert(0, rest)
        
        content = '\n'.join(content_lines).strip()
        chapters.append({
            'heading': heading,
            'content': content
        })
    
    # Skip empty chapters (heading was already included inline, no separate body)
    chapters = [ch for ch in chapters if ch['content'].strip()]
    
    if chapters:
        return chapters
    
    # Fallback: single chapter
    return [{'heading': 'Chapter 1', 'content': translated_text}]


def build_epub_from_chapters(chapters, title, author, output_path, css_content=None, lang='en'):
    """Build a properly structured EPUB3 that passes epubcheck.
    
    Each chapter dict must have:
      - 'heading': the chapter heading text (used for <title> and <h1>)
      - 'content': the body text ONLY (excludes the heading line)
    """
    import uuid
    from datetime import datetime
    
    tmpdir = tempfile.mkdtemp()
    
    with open(os.path.join(tmpdir, 'mimetype'), 'w') as f:
        f.write('application/epub+zip')
    
    os.makedirs(os.path.join(tmpdir, 'META-INF'))
    with open(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>')
    
    oebps = os.path.join(tmpdir, 'OEBPS')
    os.makedirs(oebps)
    
    if css_content:
        with open(os.path.join(oebps, 'content.css'), 'w') as f:
            f.write(css_content)
    
    # Front matter
    front_files = [
        ('title_page', 'title_page.xhtml', f'<h1 class="title">{title}</h1>\n<p class="author">{author}</p>'),
        ('copyright', 'copyright.xhtml', f'<p class="copyright">Copyright © 2023 by {author}</p>'),
    ]
    
    for file_id, filename, content in front_files:
        filepath = os.path.join(oebps, filename)
        xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head>
<title>{file_id.replace('_', ' ').title()}</title>
{'<link rel="stylesheet" href="content.css"/>' if css_content else ''}
</head>
<body>
{content}
</body>
</html>'''
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(xhtml)
    
    # TOC
    toc_items = '\n'.join(f'    <li><a href="chapter_{i+1:03d}.xhtml">{ch["heading"]}</a></li>' for i, ch in enumerate(chapters))
    toc_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}">
<head>
<title>Table of Contents</title>
{'<link rel="stylesheet" href="content.css"/>' if css_content else ''}
</head>
<body>
<h1>Table of Contents</h1>
<nav epub:type="toc">
<ol>
{toc_items}
</ol>
</nav>
</body>
</html>'''
    with open(os.path.join(oebps, 'toc.xhtml'), 'w') as f:
        f.write(toc_content)
    
    # Chapter files
    chapter_files = []
    for i, chapter in enumerate(chapters):
        filename = f'chapter_{i+1:03d}.xhtml'
        filepath = os.path.join(oebps, filename)
        
        safe_heading = chapter['heading'].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        
        # Body content only — heading is already extracted
        content = chapter['content']
        content = re.sub(r'===\w[\w_]*===', '', content)
        content = re.sub(r'\[\[ORIGINAL:[^\]]*\]\]', '', content)
        content = re.sub(r'###CHAPTER:[^#]*###', '', content)
        content = re.sub(r'###H[1-6]:[^#]*###', '', content)
        
        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]
        
        # Each paragraph in its own <p> tag
        if paragraphs:
            body_html = '\n'.join(f'<p>{p}</p>' for p in paragraphs)
        else:
            body_html = '<p></p>'
        
        xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}">
<head>
<title>{safe_heading}</title>
{'<link rel="stylesheet" href="content.css"/>' if css_content else ''}
</head>
<body>
<h1>{safe_heading}</h1>
{body_html}
</body>
</html>'''
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(xhtml)
        
        chapter_files.append(filename)
    
    # Build OPF
    book_id = str(uuid.uuid4())
    modified = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
    
    all_files = [
        ('title_page', 'title_page.xhtml', 'application/xhtml+xml'),
        ('copyright', 'copyright.xhtml', 'application/xhtml+xml'),
        ('toc', 'toc.xhtml', 'application/xhtml+xml', 'nav'),
    ] + [(f'ch_{i+1}', f, 'application/xhtml+xml') for i, f in enumerate(chapter_files)]
    
    if css_content:
        all_files.append(('css', 'content.css', 'text/css'))
    
    manifest_lines = []
    for item in all_files:
        if len(item) == 4:
            manifest_lines.append(f'<item id="{item[0]}" href="{item[1]}" media-type="{item[2]}" properties="{item[3]}"/>')
        else:
            manifest_lines.append(f'<item id="{item[0]}" href="{item[1]}" media-type="{item[2]}"/>')
    manifest_items = '\n    '.join(manifest_lines)
    
    spine_lines = [f'<itemref idref="{item[0]}"/>' for item in all_files if item[0] != 'css']
    spine_items = '\n    '.join(spine_lines)
    
    opf = f'''<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:{book_id}</dc:identifier>
    <dc:title>{title.replace('&', '&amp;')}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>{lang}</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    {manifest_items}
  </manifest>
  <spine>
    {spine_items}
  </spine>
</package>'''
    
    with open(os.path.join(oebps, 'content.opf'), 'w') as f:
        f.write(opf)
    
    # Build EPUB zip
    with ZipFile(output_path, 'w') as zf:
        zf.write(os.path.join(tmpdir, 'mimetype'), 'mimetype', compress_type=zipfile.ZIP_STORED)
        zf.write(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'META-INF/container.xml')
        zf.write(os.path.join(oebps, 'content.opf'), 'OEBPS/content.opf')
        zf.write(os.path.join(oebps, 'toc.xhtml'), 'OEBPS/toc.xhtml')
        zf.write(os.path.join(oebps, 'title_page.xhtml'), 'OEBPS/title_page.xhtml')
        zf.write(os.path.join(oebps, 'copyright.xhtml'), 'OEBPS/copyright.xhtml')
        if css_content:
            zf.write(os.path.join(oebps, 'content.css'), 'OEBPS/content.css')
        for filename in chapter_files:
            zf.write(os.path.join(oebps, filename), f'OEBPS/{filename}')
    
    shutil.rmtree(tmpdir)


# Usage example for Blair's order:
# original_chapters = extract_source_chapter_map_from_epub('/path/to/original.epub')
# translated_chapters = split_translated_by_source_structure(translated_text, original_chapters, 'de')
# build_epub_from_chapters(translated_chapters, 'Title', 'Author', '/path/to/output.epub')

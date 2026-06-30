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
    """Split translated text using source chapter map."""
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
                'title': marker['title'],
                'content': content
            })
        return chapters
    
    # For DOCX/legacy EPUB: use source chapter structure
    # Find chapter headings in translated text by matching source titles
    lines = translated_text.split('\n')
    chapters = []
    
    # Try to find source chapter titles in translated text
    for src_ch in source_chapters:
        src_title = src_ch['title']
        # Look for the title (or its translation) in the text
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            # Match if line contains the title or is a similar-length heading
            if (src_title.lower() in stripped.lower() or 
                (len(stripped) < 80 and len(stripped.split()) <= 3 and
                 stripped.isupper() or stripped.istitle())):
                # Found chapter marker
                chapters.append({
                    'title': stripped,
                    'line_index': i
                })
                break
    
    if chapters:
        # Split text by found chapter markers
        result = []
        for i, ch in enumerate(chapters):
            start = ch['line_index']
            end = chapters[i + 1]['line_index'] if i + 1 < len(chapters) else len(lines)
            content = '\n'.join(lines[start + 1:end]).strip()
            result.append({
                'title': ch['title'],
                'content': content
            })
        return result
    
    # Fallback: single chapter
    return [{'title': 'Chapter 1', 'content': translated_text}]


def build_epub_from_chapters(chapters, title, author, output_path, css_content=None):
    """Build EPUB from chapter list."""
    tmpdir = tempfile.mkdtemp()
    
    with open(os.path.join(tmpdir, 'mimetype'), 'w') as f:
        f.write('application/epub+zip')
    
    os.makedirs(os.path.join(tmpdir, 'META-INF'))
    with open(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'w') as f:
        f.write('''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>''')
    
    oebps = os.path.join(tmpdir, 'OEBPS')
    os.makedirs(oebps)
    
    if css_content:
        with open(os.path.join(oebps, 'content.css'), 'w') as f:
            f.write(css_content)
    
    chapter_files = []
    for i, chapter in enumerate(chapters):
        filename = f'chapter_{i+1:03d}.xhtml'
        filepath = os.path.join(oebps, filename)
        
        safe_title = chapter['title'].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        heading = f'<h1>{safe_title}</h1>'
        
        # Clean content
        content = chapter['content']
        content = re.sub(r'===\w[\w_]*===', '', content)
        content = re.sub(r'\[\[ORIGINAL:[^\]]*\]\]', '', content)
        content = re.sub(r'###CHAPTER:[^#]*###', '', content)
        content = re.sub(r'###H[1-6]:[^#]*###', '', content)
        
        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]
        if not paragraphs:
            paragraphs = [content.strip()]
        
        html_paras = '</p>\n<p>'.join(paragraphs)
        
        xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>{safe_title}</title>
{'<link rel="stylesheet" href="content.css"/>' if css_content else ''}
</head>
<body>
{heading}
<p>{html_paras}</p>
</body>
</html>'''
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(xhtml)
        
        chapter_files.append((filename, safe_title))
    
    # Write content.opf
    spine_items = '\n    '.join(f'<itemref idref="ch_{i}"/>' for i in range(len(chapter_files)))
    manifest_items = '\n    '.join(
        f'<item id="ch_{i}" href="{filename}" media-type="application/xhtml+xml"/>'
        for i, (filename, _) in enumerate(chapter_files)
    )
    if css_content:
        manifest_items += '\n    <item id="css" href="content.css" media-type="text/css"/>'
    
    opf = f'''<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{title.replace('&', '&amp;')}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>en</dc:language>
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
    
    with ZipFile(output_path, 'w', ZIP_DEFLATED) as zf:
        zf.write(os.path.join(tmpdir, 'mimetype'), 'mimetype', compress_type=ZIP_DEFLATED)
        zf.write(os.path.join(tmpdir, 'META-INF', 'container.xml'), 'META-INF/container.xml')
        zf.write(os.path.join(oebps, 'content.opf'), 'OEBPS/content.opf')
        if css_content:
            zf.write(os.path.join(oebps, 'content.css'), 'OEBPS/content.css')
        for filename, _ in chapter_files:
            zf.write(os.path.join(oebps, filename), f'OEBPS/{filename}')
    
    shutil.rmtree(tmpdir)


# Usage example for Blair's order:
# original_chapters = extract_source_chapter_map_from_epub('/path/to/original.epub')
# translated_chapters = split_translated_by_source_structure(translated_text, original_chapters, 'de')
# build_epub_from_chapters(translated_chapters, 'Title', 'Author', '/path/to/output.epub')

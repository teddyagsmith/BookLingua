import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from lib.booklingua_epub_builder import split_translated_by_source_structure, build_epub_from_chapters

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--content', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--title', required=True)
    parser.add_argument('--author', default='Translated by BookLingua')
    parser.add_argument('--lang', default='en')
    args = parser.parse_args()
    
    with open(args.content, 'r', encoding='utf-8') as f:
        translated_text = f.read()
    
    chapters = split_translated_by_source_structure(translated_text, [], args.lang)
    build_epub_from_chapters(chapters, args.title, args.author, args.output, lang=args.lang)
    print('EPUB built successfully')

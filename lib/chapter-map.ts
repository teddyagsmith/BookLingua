import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from 'docx'
import { SemanticDocumentV2 } from './semantic-document'
import { deterministicDocx } from './deterministic-docx'

export interface ChapterMapRow {
  chapterId: string
  sourceChapterNumber: string | null
  sourceTitle: string
  translatedChapterNumber: string | null
  translatedTitle: string
  status: 'mapped' | 'missing_translation'
}

export function buildChapterMap(document: SemanticDocumentV2): ChapterMapRow[] {
  const rows = document.nodes
    .filter(node => node.type === 'heading' && node.headingLevel === 1 && node.chapterId)
    .map(node => ({
      chapterId: node.chapterId!,
      sourceChapterNumber: node.sourceChapterNumber,
      sourceTitle: node.sourceText,
      translatedChapterNumber: node.sourceChapterNumber,
      translatedTitle: node.translatedText || '',
      status: node.translatedText ? 'mapped' as const : 'missing_translation' as const,
    }))
  if (new Set(rows.map(row => row.chapterId)).size !== rows.length) throw new Error('Duplicate chapter ID in chapter map')
  return rows
}

function csvCell(value: string | null): string {
  return `"${(value || '').replace(/"/g, '""')}"`
}

export function renderChapterMapCsv(rows: ChapterMapRow[]): string {
  return [
    ['chapter_id', 'source_number', 'source_title', 'translated_number', 'translated_title', 'status'].join(','),
    ...rows.map(row => [row.chapterId, row.sourceChapterNumber, row.sourceTitle, row.translatedChapterNumber, row.translatedTitle, row.status].map(csvCell).join(',')),
  ].join('\n')
}

export async function renderChapterMapDocx(rows: ChapterMapRow[]): Promise<Buffer> {
  const tableRows = [
    new TableRow({ children: ['Source', 'Translation', 'Status'].map(text => new TableCell({ children: [new Paragraph({ text })] })) }),
    ...rows.map(row => new TableRow({ children: [
      new TableCell({ children: [new Paragraph(`${row.sourceChapterNumber || ''} ${row.sourceTitle}`.trim())] }),
      new TableCell({ children: [new Paragraph(`${row.translatedChapterNumber || ''} ${row.translatedTitle}`.trim())] }),
      new TableCell({ children: [new Paragraph(row.status)] }),
    ] })),
  ]
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: 'BookLingua Chapter Map', heading: HeadingLevel.TITLE }),
    new Table({ rows: tableRows }),
  ] }] }))))
}

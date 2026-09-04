import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { brandedDocumentHeader } from './branded-document-header'
import { SemanticDocumentV2 } from './semantic-document'
import { deterministicDocx } from './deterministic-docx'
import { BOOKLINGUA_CLEAN_BOOK_STYLE } from './formatting-policy'
import { consolidatedArtifactNodes, decodeVisibleEntities } from './semantic-artifacts'

export interface ChapterMapRow {
  chapterId: string
  headingLevel?: number
  locationMarker?: string
  sourceChapterNumber: string | null
  sourceTitle: string
  translatedChapterNumber: string | null
  translatedTitle: string
  status: 'mapped' | 'missing_translation'
}

export function buildChapterMap(document: SemanticDocumentV2): ChapterMapRow[] {
  const candidates = consolidatedArtifactNodes(document)
    .filter(node => node.type === 'heading')
    .map(node => ({
      chapterId: node.id,
      headingLevel: node.headingLevel || 1,
      locationMarker: `Paragraph ${node.order + 1}`,
      sourceChapterNumber: node.sourceChapterNumber,
      sourceTitle: decodeVisibleEntities(node.sourceText),
      translatedChapterNumber: node.sourceChapterNumber,
      translatedTitle: decodeVisibleEntities(node.translatedText || ''),
      status: node.translatedText ? 'mapped' as const : 'missing_translation' as const,
    }))
  // Some source parsers associate front-matter H1s with the first numbered
  // chapter. When the same chapter number appears twice, the later heading is
  // the actual chapter boundary; omit the front-matter/title row.
  const rows = candidates.filter((row,index) => !row.sourceChapterNumber
    || !candidates.slice(index + 1).some(next => next.sourceChapterNumber === row.sourceChapterNumber))
  if (new Set(rows.map(row => row.chapterId)).size !== rows.length) throw new Error('Duplicate chapter ID in chapter map')
  return rows
}

function csvCell(value: string | null): string {
  return `"${(value || '').replace(/"/g, '""')}"`
}

export function renderChapterMapCsv(rows: ChapterMapRow[]): string {
  return [
    ['chapter_id', 'heading_level', 'location_marker', 'source_number', 'source_title', 'translated_number', 'translated_title', 'status'].join(','),
    ...rows.map(row => [row.chapterId, `H${row.headingLevel||1}`, row.locationMarker||row.chapterId, row.sourceChapterNumber, row.sourceTitle, row.translatedChapterNumber, row.translatedTitle, row.status].map(value=>csvCell(String(value ?? ''))).join(',')),
  ].join('\n')
}

export async function renderChapterMapDocx(rows: ChapterMapRow[], options: { bookTitle?: string; language?: string } = {}): Promise<Buffer> {
  rows=options.bookTitle?rows.filter(row=>row.sourceTitle.trim()!==options.bookTitle!.trim()):rows
  const width=(text:string)=>text==='Level'?800:text==='Location'?1700:text==='Chapter'?1200:2650
  const header=(text:string)=>new TableCell({shading:{fill:'EDE9FE'},width:{size:width(text),type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text,bold:true,color:'4C1D95',size:18})]})]})
  const tableRows = [
    new TableRow({ tableHeader:true, children: ['Chapter', 'Level', 'Location', 'Original heading', 'Translated heading'].map(header) }),
    ...rows.map(row => new TableRow({ children: [
      new TableCell({width:{size:1200,type:WidthType.DXA},margins:{left:90,right:90},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:row.sourceChapterNumber||row.chapterId.replace(/^node-0*/,''),bold:true})]})]}),
      new TableCell({width:{size:800,type:WidthType.DXA},margins:{left:70,right:70},children:[new Paragraph(`H${row.headingLevel||1}`)]}),
      new TableCell({width:{size:1700,type:WidthType.DXA},margins:{left:70,right:70},children:[new Paragraph(row.locationMarker||row.chapterId)]}),
      new TableCell({width:{size:2650,type:WidthType.DXA},margins:{left:90,right:90},children:[new Paragraph(row.sourceTitle)]}),
      new TableCell({width:{size:2650,type:WidthType.DXA},margins:{left:90,right:90},children:[new Paragraph(row.translatedTitle)]}),
    ] })),
  ]
  const title=options.bookTitle?`${options.bookTitle} — Chapter Map`:'BookLingua Chapter Map'
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles:{default:{document:{run:{font:'Georgia',size:BOOKLINGUA_CLEAN_BOOK_STYLE.bodySizeHalfPoints}}}},
    sections: [{properties:{page:{margin:BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'BookLingua · Translate your book in hours, not months · ',font:'Georgia',color:'6B7280',size:18}),new TextRun({children:[PageNumber.CURRENT],font:'Georgia',color:'6B7280',size:18})]})]})},children: [
      ...brandedDocumentHeader(),
      new Paragraph({heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,children:[new TextRun({text:title,font:'Georgia',bold:true,color:'312E81',size:38})]}),
      ...(options.language?[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:options.language,italics:true,color:'555555'})]})]:[]),
      new Paragraph({text:'Use this Chapter Map to match chapters in your original manuscript with their translated equivalents when editing or uploading your translated book.',alignment:AlignmentType.CENTER,spacing:{after:240}}),
      new Table({ rows: tableRows, width:{size:9000,type:WidthType.DXA},columnWidths:[1200,800,1700,2650,2650],layout:TableLayoutType.FIXED,borders:{top:{style:BorderStyle.SINGLE,size:2,color:'D1D5DB'},bottom:{style:BorderStyle.SINGLE,size:2,color:'D1D5DB'},left:{style:BorderStyle.SINGLE,size:2,color:'D1D5DB'},right:{style:BorderStyle.SINGLE,size:2,color:'D1D5DB'},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:'E5E7EB'},insideVertical:{style:BorderStyle.SINGLE,size:1,color:'E5E7EB'}} }),
    ]}]
  }))))
}

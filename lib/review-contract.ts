import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

export const REVIEW_CONTRACT_VERSION = '1.0'
export const REVIEW_LEGEND = 'Yellow strikethrough text is the Pass 1 translation. The following yellow text is the Pass 2 editorial replacement.'

export function buildPass1Docx(text: string, title: string, language: string): Promise<Buffer> {
  const paragraphs = text.split(/\n+/).filter(Boolean).map(line => new Paragraph(line))
  return Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: `${title} — ${language} — Pass 1 Translation`, heading: HeadingLevel.TITLE }),
    ...paragraphs,
  ] }] }))
}

export function buildReviewContractDocx(markedText: string, title: string, language: string): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: `${title} — ${language} — Review`, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: REVIEW_LEGEND }),
  ]
  for (const line of markedText.split(/\n+/).filter(Boolean)) {
    const runs: TextRun[] = []
    const pattern = /\[\[ORIGINAL:\s*([\s\S]*?)\]\]([^[]*)/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) runs.push(new TextRun(line.slice(last, match.index)))
      runs.push(new TextRun({ text: match[1], strike: true, highlight: 'yellow' }))
      runs.push(new TextRun({ text: match[2], highlight: 'yellow' }))
      last = pattern.lastIndex
    }
    if (last < line.length) runs.push(new TextRun(line.slice(last)))
    children.push(new Paragraph({ children: runs.length ? runs : [new TextRun(line)] }))
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

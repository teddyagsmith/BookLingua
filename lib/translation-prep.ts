/**
 * BookLingua Translation Prep
 * 
 * Converts a structural template into numbered paragraphs for the translation prompt.
 * The translator receives clean text with paragraph numbers (P1, P2, etc.) and is
 * expected to return the same count and order.
 * 
 * After translation, the pipeline strips the numbers and maps paragraphs back to
 * the template structure.
 */

import { BookStructureTemplate, ParagraphTemplate, ChapterTemplate } from './structure-template'

export interface NumberedParagraph {
  globalIndex: number      // P1, P2, P3, etc.
  chapterIndex: number      // Which chapter this belongs to
  paraIndex: number         // Which paragraph within the chapter
  type: string
  text: string
}

/**
 * Flatten template chapters into sequentially numbered paragraphs.
 * Returns string ready for the translation prompt.
 */
export function prepareNumberedTranslation(template: BookStructureTemplate): {
  promptText: string
  paragraphMap: NumberedParagraph[]
} {
  const paragraphs: NumberedParagraph[] = []
  let globalIdx = 1

  for (const ch of template.chapters) {
    for (const para of ch.paragraphs) {
      paragraphs.push({
        globalIndex: globalIdx,
        chapterIndex: ch.index,
        paraIndex: para.index,
        type: para.type,
        text: para.text,
      })
      globalIdx++
    }
  }

  // Build prompt text
  const lines: string[] = [
    `Translate the following ${paragraphs.length} paragraphs from English.`,
    ``,
    `RULES:`,
    `1. Return EXACTLY ${paragraphs.length} paragraphs — one for each P number.`,
    `2. Preserve the paragraph numbering (P1, P2, etc.) in your response.`,
    `3. Do not merge or split paragraphs. Each P number = one paragraph.`,
    `4. Translate the meaning, not word-for-word. Maintain tone and voice.`,
    `5. Dialogue (marked with quotes) should remain dialogue.`,
    `6. Scene breaks should remain scene breaks.`,
    ``,
    `---`,
    ``,
  ]

  for (const para of paragraphs) {
    lines.push(`P${para.globalIndex}: ${para.text}`)
  }

  return {
    promptText: lines.join('\n'),
    paragraphMap: paragraphs,
  }
}

/**
 * Parse numbered translation response back into structured chapters.
 * Returns chapters matching the template structure.
 */
export function parseNumberedTranslation(
  responseText: string,
  paragraphMap: NumberedParagraph[],
  template: BookStructureTemplate
): BookStructureTemplate {
  // Extract P-numbered paragraphs from response
  const translatedParas: Map<number, string> = new Map()
  
  const paraRegex = /^P(\d+)\s*[:\-]\s*(.*)$/gm
  let match
  while ((match = paraRegex.exec(responseText)) !== null) {
    const num = parseInt(match[1], 10)
    const text = match[2].trim()
    translatedParas.set(num, text)
  }

  // Validate count
  if (translatedParas.size !== paragraphMap.length) {
    console.warn(
      `[Translation] Paragraph count mismatch: expected ${paragraphMap.length}, got ${translatedParas.size}`
    )
  }

  // Rebuild chapters with translated text
  const newChapters = template.chapters.map(ch => ({
    ...ch,
    paragraphs: ch.paragraphs.map(para => {
      // Find the global index for this paragraph
      const mapEntry = paragraphMap.find(
        p => p.chapterIndex === ch.index && p.paraIndex === para.index
      )
      
      if (mapEntry && translatedParas.has(mapEntry.globalIndex)) {
        return {
          ...para,
          text: translatedParas.get(mapEntry.globalIndex)!,
        }
      }
      
      // Fallback: keep original if translation missing
      return para
    }),
  }))

  return {
    ...template,
    chapters: newChapters,
  }
}

/**
 * Strip paragraph numbering from text (for storage or output).
 */
export function stripParagraphNumbers(text: string): string {
  return text
    .replace(/^P\d+\s*[:\-]\s*/gm, '')
    .replace(/^\[P\d+\]\s*/gm, '')
    .trim()
}

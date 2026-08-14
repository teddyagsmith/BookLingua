export const SOURCE_FORMATTING_POLICY_VERSION = '1.0'

export const BOOKLINGUA_CLEAN_BOOK_STYLE = {
  version: '1.0',
  bodyFont: 'Georgia',
  bodySizeHalfPoints: 22,
  bodyLineSpacingTwips: 276,
  firstLineIndentTwips: 360,
  pageMarginsTwips: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
  chapterHeadingFont: 'Georgia',
  chapterHeadingSizeHalfPoints: 32,
  titleSizeHalfPoints: 40,
} as const

export type SourceFormattingDisposition = 'preserve' | 'preserve-and-normalize' | 'clean-fallback'

export interface SourceFormattingAssessment {
  disposition: SourceFormattingDisposition
  reason: string
}

export function assessSourceFormatting(input: {
  sourceFormat: 'epub' | 'docx' | 'txt'
  parserConfidence: number
  hasHeadings: boolean
  hasPresentationMetadata: boolean
}): SourceFormattingAssessment {
  if (input.sourceFormat === 'txt' || input.parserConfidence < 0.6) {
    return { disposition: 'clean-fallback', reason: 'Source has no reliable reusable presentation layer.' }
  }
  if (input.hasPresentationMetadata && input.hasHeadings) {
    return { disposition: 'preserve', reason: 'Source has coherent structure and reusable presentation metadata.' }
  }
  return { disposition: 'preserve-and-normalize', reason: 'Source structure is usable but presentation metadata is incomplete.' }
}

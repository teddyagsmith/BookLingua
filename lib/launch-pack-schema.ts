export const LAUNCH_PACK_SCHEMA_VERSION = '1.0'

export interface LaunchPackV1 {
  schemaVersion: typeof LAUNCH_PACK_SCHEMA_VERSION
  language: string
  market: string
  backendKeywords: string[]
  adKeywords: string[]
  categories: string[]
  pricingRecommendation: { ebook: string; paperback: string; reasoning: string }
  bookDescription: string
  reviewStrategy: string[]
  kdpUploadChecklist: string[]
}

export function validateLaunchPack(input: {
  pack: LaunchPackV1
  expectedLanguage: string
  expectedMarket: string
  purchased: boolean
}): string[] {
  const errors: string[] = []
  if (!input.purchased) errors.push('Launch Pack generation is not entitled for this language')
  if (input.pack.schemaVersion !== LAUNCH_PACK_SCHEMA_VERSION) errors.push('Unexpected Launch Pack schema version')
  if (input.pack.language !== input.expectedLanguage) errors.push('Launch Pack target language mismatch')
  if (input.pack.market !== input.expectedMarket) errors.push('Launch Pack target market mismatch')
  if (input.pack.backendKeywords.length !== 7) errors.push('Launch Pack must contain exactly 7 backend keyword boxes')
  if (input.pack.backendKeywords.some(keyword => keyword.length > 50 || !keyword.trim())) errors.push('Backend keyword boxes must be non-empty and at most 50 characters')
  if (input.pack.adKeywords.length < 20) errors.push('Launch Pack must contain at least 20 ad keywords')
  if (input.pack.categories.length < 3) errors.push('Launch Pack must contain at least 3 categories')
  if (!input.pack.bookDescription.trim()) errors.push('Launch Pack book description is empty')
  if (!input.pack.pricingRecommendation.ebook || !input.pack.pricingRecommendation.paperback || !input.pack.pricingRecommendation.reasoning) errors.push('Launch Pack pricing recommendation is incomplete')
  if (!input.pack.reviewStrategy.length) errors.push('Launch Pack review strategy is empty')
  if (!input.pack.kdpUploadChecklist.length) errors.push('Launch Pack KDP checklist is empty')
  return errors
}

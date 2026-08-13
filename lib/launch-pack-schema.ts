export const LAUNCH_PACK_SCHEMA_VERSION = '2.0'

export const LAUNCH_MARKETS = {
  'es-es': { language: 'Spanish (Spain)', market: 'Spain', amazonDomain: 'amazon.es', currency: 'EUR' },
  'es-419': { language: 'Spanish (Latin America)', market: 'Mexico and Spanish-speaking Latin America', amazonDomain: 'amazon.com.mx', currency: 'MXN/USD' },
  fr: { language: 'French', market: 'France', amazonDomain: 'amazon.fr', currency: 'EUR' },
  de: { language: 'German', market: 'Germany', amazonDomain: 'amazon.de', currency: 'EUR' },
  'pt-pt': { language: 'Portuguese (Portugal)', market: 'Portugal', amazonDomain: 'amazon.es', currency: 'EUR' },
  'pt-br': { language: 'Portuguese (Brazil)', market: 'Brazil', amazonDomain: 'amazon.com.br', currency: 'BRL' },
} as const
export type LaunchLocale = keyof typeof LAUNCH_MARKETS

export interface LaunchPackV1 {
  schemaVersion: typeof LAUNCH_PACK_SCHEMA_VERSION
  locale: LaunchLocale
  language: string
  market: string
  amazonDomain: string
  currency: string
  backendKeywords: string[]
  adKeywords: string[]
  categories: string[]
  pricingRecommendation: { ebook: string; paperback: string; reasoning: string }
  bookDescription: string
  reviewStrategy: string[]
  kdpUploadChecklist: string[]
}

export function launchMarket(locale: string) {
  const market = LAUNCH_MARKETS[locale as LaunchLocale]
  if (!market) throw new Error(`Unsupported Launch Pack locale: ${locale}`)
  return { locale: locale as LaunchLocale, ...market }
}

export function validateLaunchPack(input: { pack: LaunchPackV1; expectedLocale: string; purchased: boolean }): string[] {
  const errors: string[] = []
  let expected: ReturnType<typeof launchMarket> | null = null
  try { expected = launchMarket(input.expectedLocale) } catch (error) { errors.push((error as Error).message) }
  if (!input.purchased) errors.push('Launch Pack generation is not entitled for this language')
  if (input.pack.schemaVersion !== LAUNCH_PACK_SCHEMA_VERSION) errors.push('Unexpected Launch Pack schema version')
  if (expected && (input.pack.locale !== expected.locale || input.pack.language !== expected.language || input.pack.market !== expected.market || input.pack.amazonDomain !== expected.amazonDomain || input.pack.currency !== expected.currency)) errors.push('Launch Pack locale/market identity mismatch')
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

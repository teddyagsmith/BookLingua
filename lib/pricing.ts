import { bundleDiscountPercent } from './bundle-pricing'

export type PricingTierKey = 'small' | 'medium' | 'large'

export type PricingTier = {
  key: PricingTierKey
  maxWords: number
  label: string
  bandLabel: string
  description: string
  basePrice: number
}

export const WORD_TIERS: Readonly<Record<PricingTierKey, PricingTier>> = {
  small: {
    key: 'small', maxWords: 40_000, label: 'Up to 40k words',
    bandLabel: 'Up to 40,000 words', description: 'Short book or novella: up to 40,000 words', basePrice: 99,
  },
  medium: {
    key: 'medium', maxWords: 80_000, label: 'Up to 80k words',
    bandLabel: 'Up to 80,000 words', description: 'Standard book: up to 80,000 words', basePrice: 149,
  },
  large: {
    key: 'large', maxWords: 150_000, label: 'Up to 150k words',
    bandLabel: 'Up to 150,000 words', description: 'Large book: up to 150,000 words', basePrice: 199,
  },
}

export function pricingTierForWordCount(wordCount: number): PricingTier | null {
  if (!Number.isInteger(wordCount) || wordCount <= 0) return null
  if (wordCount <= WORD_TIERS.small.maxWords) return WORD_TIERS.small
  if (wordCount <= WORD_TIERS.medium.maxWords) return WORD_TIERS.medium
  if (wordCount <= WORD_TIERS.large.maxWords) return WORD_TIERS.large
  return null
}

export function calculateTranslationPrice(wordCount: number, languageCount: number) {
  const tier = pricingTierForWordCount(wordCount)
  if (!tier || !Number.isInteger(languageCount) || languageCount < 1) return null
  const subtotal = tier.basePrice * languageCount
  const discountPercent = bundleDiscountPercent(languageCount)
  const discountAmount = Math.round(subtotal * discountPercent) / 100
  const total = Math.round((subtotal - discountAmount) * 100) / 100
  return { tier, languageCount, subtotal, discountPercent, discountAmount, total }
}

export const BUNDLE_DISCOUNT_PCT: Readonly<Record<number, number>> = {
  1: 0, 2: 7, 3: 10, 4: 12, 5: 15, 6: 20,
}

export function bundleDiscountPercent(languageCount: number): number {
  if (!Number.isFinite(languageCount) || languageCount < 1) return 0
  return BUNDLE_DISCOUNT_PCT[Math.min(Math.floor(languageCount), 6)] ?? 0
}

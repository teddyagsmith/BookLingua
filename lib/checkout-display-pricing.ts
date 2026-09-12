import { bundleDiscountPercent } from './bundle-pricing'

export type DisplayVoucher = {
  discount: number
  type: 'percent' | 'fixed'
} | null

export function launchPackPrice(languageCount: number): number {
  return languageCount > 1 ? 49 : 29
}

export function checkoutDisplayPricing(input: {
  basePrice: number | null
  languageCount: number
  selectedUpsells: string[]
  voucher: DisplayVoucher
}) {
  const { basePrice, languageCount, selectedUpsells, voucher } = input
  const translationBeforeBundle = basePrice && languageCount > 0 ? basePrice * languageCount : 0
  const translationTotal = translationBeforeBundle * (1 - bundleDiscountPercent(languageCount) / 100)
  const launchPack = selectedUpsells.includes('launch-pack') ? launchPackPrice(languageCount) : 0
  const mrrShoutout = selectedUpsells.includes('mrr-shoutout') ? 69 : 0
  const dualFormat = selectedUpsells.includes('dual-format') ? 29 : 0
  const addOnTotal = launchPack + mrrShoutout + dualFormat
  const subtotal = translationTotal + addOnTotal

  // Launch Pack and MRR shoutout are excluded from voucher discounts.
  const voucherableSubtotal = translationTotal + dualFormat
  const voucherDiscount = !voucher
    ? 0
    : voucher.type === 'percent'
      ? voucherableSubtotal * (voucher.discount / 100)
      : Math.min(voucher.discount, voucherableSubtotal)

  return {
    translationTotal,
    addOnTotal,
    subtotal,
    voucherableSubtotal,
    voucherDiscount,
    finalTotal: Math.max(subtotal - voucherDiscount, 1),
  }
}

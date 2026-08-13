export const MODEL_PRICING_VERSION = 'anthropic-2026-08-13'
export const MODEL_PRICING_SOURCE = 'https://docs.anthropic.com/en/docs/about-claude/pricing'

const USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
}

export function estimateModelCostUsd(modelId: string, inputTokens?: number, outputTokens?: number): { cost: number; pricingVersion: string } | null {
  const price = USD_PER_MILLION[modelId]
  if (!price || inputTokens === undefined || outputTokens === undefined) return null
  return { cost: (inputTokens * price.input + outputTokens * price.output) / 1_000_000, pricingVersion: MODEL_PRICING_VERSION }
}

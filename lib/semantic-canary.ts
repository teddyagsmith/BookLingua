export function semanticV2AllowedForOrder(orderId: string, pipelineVersion: unknown): boolean {
  if (pipelineVersion !== 'semantic-v2') return false
  if (process.env.PIPELINE_VERSION === 'semantic-v2') return true
  const ids = (process.env.SEMANTIC_V2_CANARY_ORDER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean)
  return ids.includes(orderId)
}

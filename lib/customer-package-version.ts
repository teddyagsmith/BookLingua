export const CUSTOMER_PACKAGE_VERSION = 'customer-package-v1' as const
export const DEFAULT_NEW_ORDER_PIPELINE = 'semantic-v2' as const

export function newOrderPipelineFields() {
  return {
    pipeline_version: DEFAULT_NEW_ORDER_PIPELINE,
    customer_package_version: CUSTOMER_PACKAGE_VERSION,
  }
}

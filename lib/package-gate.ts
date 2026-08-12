import { SupabaseClient } from '@supabase/supabase-js'
import { assemblePackageManifest, evaluatePackageManifest, PackageManifestV1 } from './package-manifest'
import { recordPipelineEvent } from './pipeline-events'

export async function resolvePackageGate(
  supabase: SupabaseClient,
  input: { orderId: string; language: string; buildId: string },
): Promise<PackageManifestV1> {
  const manifest = await assemblePackageManifest({ supabase, ...input })
  const evaluated = evaluatePackageManifest(manifest)
  const { error: manifestError } = await supabase.from('package_manifests').upsert({
    order_id: evaluated.orderId,
    language: evaluated.language,
    build_id: evaluated.buildId,
    schema_version: evaluated.schemaVersion,
    status: evaluated.status,
    manifest: evaluated,
  }, { onConflict: 'order_id,language,build_id' })
  if (manifestError) throw new Error(`Package manifest persistence failed: ${manifestError.message}`)

  const { data: orderStatus, error: orderError } = await supabase.rpc('resolve_order_package_gate', { p_order_id: evaluated.orderId })
  if (orderError) throw new Error(`Package gate status update failed: ${orderError.message}`)
  await recordPipelineEvent(supabase, {
    orderId: evaluated.orderId,
    language: evaluated.language,
    stage: 'package_gate',
    status: evaluated.status === 'pass' ? 'passed' : 'failed',
    level: evaluated.status === 'pass' ? 'info' : 'error',
    safeMessage: evaluated.status === 'pass' ? 'Package validation passed' : evaluated.errors.join('; '),
  })
  return { ...evaluated, status: orderStatus === 'ready_for_review' ? evaluated.status : 'fail' }
}

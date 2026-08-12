import { SupabaseClient } from '@supabase/supabase-js'
import { evaluatePackageManifest, PackageManifestV1 } from './package-manifest'
import { recordPipelineEvent } from './pipeline-events'

export async function resolvePackageGate(
  supabase: SupabaseClient,
  manifest: PackageManifestV1,
): Promise<PackageManifestV1> {
  const evaluated = evaluatePackageManifest(manifest)
  const orderStatus = evaluated.status === 'pass' ? 'ready_for_review' : 'gate_failed'
  const { error: manifestError } = await supabase.from('package_manifests').upsert({
    order_id: evaluated.orderId,
    language: evaluated.language,
    schema_version: evaluated.schemaVersion,
    status: evaluated.status,
    manifest: evaluated,
  }, { onConflict: 'order_id,language,schema_version' })
  if (manifestError) throw new Error(`Package manifest persistence failed: ${manifestError.message}`)

  const { error: orderError } = await supabase.from('orders').update({ status: orderStatus }).eq('id', evaluated.orderId)
  if (orderError) throw new Error(`Package gate status update failed: ${orderError.message}`)
  await recordPipelineEvent(supabase, {
    orderId: evaluated.orderId,
    language: evaluated.language,
    stage: 'package_gate',
    status: evaluated.status === 'pass' ? 'passed' : 'failed',
    level: evaluated.status === 'pass' ? 'info' : 'error',
    safeMessage: evaluated.status === 'pass' ? 'Package validation passed' : evaluated.errors.join('; '),
  })
  return evaluated
}

import { SupabaseClient } from '@supabase/supabase-js'
import { assemblePackageManifest, evaluatePackageManifest, PackageManifestV1 } from './package-manifest'
import { recordPipelineEvent } from './pipeline-events'

export async function resolvePackageGate(
  supabase: SupabaseClient,
  input: { orderId: string; language: string; buildId: string },
): Promise<PackageManifestV1> {
  const { data: currentBuild, error: buildError } = await supabase.from('order_language_builds')
    .select('id').eq('order_id', input.orderId).eq('language', input.language)
    .eq('is_current', true).maybeSingle()
  if (buildError || !currentBuild || currentBuild.id !== input.buildId) {
    throw new Error('Package build is not the authoritative current build')
  }
  const manifest = await assemblePackageManifest({ supabase, ...input })
  const evaluated = evaluatePackageManifest(manifest)
  const row = {
    order_id: evaluated.orderId,
    language: evaluated.language,
    build_id: evaluated.buildId,
    schema_version: evaluated.schemaVersion,
    status: evaluated.status,
    manifest: evaluated,
  }
  const { error: manifestError } = await supabase.from('package_manifests').insert(row)
  if (manifestError) {
    if (manifestError.code !== '23505') throw new Error(`Package manifest persistence failed: ${manifestError.message}`)
    const { data: existing, error: existingError } = await supabase.from('package_manifests')
      .select('status, manifest').eq('order_id', evaluated.orderId).eq('language', evaluated.language).eq('build_id', evaluated.buildId).single()
    if (existingError || !existing || existing.status !== evaluated.status || JSON.stringify(existing.manifest) !== JSON.stringify(evaluated)) {
      throw new Error('Package gate retry does not match immutable persisted manifest')
    }
  }

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

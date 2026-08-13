import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url.startsWith('http://127.0.0.1:')) throw new Error('Terminal cleanup proof refuses non-loopback Supabase')
const db = createClient(url, key)
const stages = ['before_pass1', 'mid_pass1', 'between_passes', 'artifact_assembly']

async function main() {
for (let index = 0; index < stages.length; index++) {
  const suffix = String(index + 1).padStart(12, '0')
  const orderId = `96000000-0000-0000-0000-${suffix}`
  const buildId = `97000000-0000-0000-0000-${suffix}`
  await db.from('orders').delete().eq('id', orderId)
  const { error: orderError } = await db.from('orders').insert({
    id: orderId, email: 'cleanup-proof@example.invalid', author_name: 'Synthetic staging proof',
    book_title: 'Terminal cleanup proof', word_count: 1000, tier: 'small', file_format: '.epub', languages: ['fr'],
    upsells: [], amount_paid: 0, status: 'processing', pipeline_version: 'semantic-v2',
  })
  if (orderError) throw orderError
  const { error: buildError } = await db.rpc('begin_order_language_build', {
    p_order_id: orderId, p_language: 'fr', p_build_id: buildId,
  })
  if (buildError) throw buildError
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db.rpc('fail_active_order_builds', {
      p_order_id: orderId, p_stage: stages[index], p_safe_error: 'PIPELINE_EXECUTION_FAILURE',
      p_failed_at: '2026-08-13T00:00:00.000Z',
    })
    if (error) throw error
  }
  const build = (await db.from('order_language_builds').select('state').eq('id', buildId).single()).data
  const eventCount = (await db.from('pipeline_events').select('id', { count: 'exact', head: true })
    .eq('order_id', orderId).eq('stage', stages[index])).count
  if (build?.state !== 'failed' || eventCount !== 1) throw new Error(`Cleanup proof failed at ${stages[index]}`)
}
console.log(JSON.stringify({ terminalCleanupStages: stages, activeBuildsFailed: true, exactlyOneAuditEventPerStage: true }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })

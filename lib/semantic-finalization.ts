import { createHash } from 'crypto'
import { PackageManifestV1, evaluatePackageManifest } from './package-manifest'
import { renderAggregateReviewEmail } from './email-templates'
import { buildArtifactDownloadUrl } from './download-token'

export interface SemanticReviewSendResult { id?: string }
export type SemanticReviewSender = (message: {
  from: string
  to: string[]
  subject: string
  html: string
}, options: { idempotencyKey: string }) => Promise<SemanticReviewSendResult>

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '5'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`
}

export async function finalizeSemanticOrder(input: {
  supabase: any
  orderId: string
  bookTitle: string
  languages: string[]
  sendInternalReview: SemanticReviewSender
  internalReviewAddress: string
  appUrl: string
}): Promise<{ status: string; reviewEventCreated: boolean; emailSent: boolean }> {
  const { data: status, error: gateError } = await input.supabase.rpc('resolve_order_package_gate', { p_order_id: input.orderId })
  if (gateError) throw new Error(`Aggregate package gate failed: ${gateError.message}`)
  if (status !== 'ready_for_review') return { status, reviewEventCreated: false, emailSent: false }

  const { data: rows, error: manifestError } = await input.supabase.from('package_manifests')
    .select('language,build_id,manifest,order_language_builds!inner(is_current)')
    .eq('order_id', input.orderId).eq('status', 'pass').eq('order_language_builds.is_current', true)
  if (manifestError) throw new Error(`Review manifest lookup failed: ${manifestError.message}`)
  const manifests = input.languages.map(language => rows?.find((row: any) => row.language === language)?.manifest as PackageManifestV1 | undefined)
  if (manifests.some(manifest => !manifest || evaluatePackageManifest(manifest).status !== 'pass')) {
    throw new Error('Aggregate gate returned ready without every authoritative PASS manifest')
  }

  const buildIdentity = manifests.map(manifest => `${manifest!.language}:${manifest!.buildId}`).sort().join('|')
  const eventId = deterministicUuid(`internal-review:${input.orderId}:${buildIdentity}`)
  const eventKey = `internal-review/${eventId}`
  const links: Record<string, Record<string, string>> = {}
  for (const manifest of manifests as PackageManifestV1[]) {
    links[manifest.language] = Object.fromEntries(manifest.artifacts.map(artifact => [artifact.type,
      buildArtifactDownloadUrl(input.orderId, manifest.language, artifact.type, input.appUrl)]))
  }
  const email = renderAggregateReviewEmail({ bookTitle: input.bookTitle, adminUrl: `${input.appUrl}/admin`, manifests: manifests as PackageManifestV1[], artifactUrls: links })

  const { error: claimError } = await input.supabase.from('pipeline_events').insert({
    id: eventId, order_id: input.orderId, language: 'all', stage: 'internal_review_email', status: 'started',
    level: 'info', safe_message: 'INTERNAL_REVIEW_READY', details: { eventKey, buildIdentity, templateVersion: email.templateVersion },
  })
  if (claimError && claimError.code !== '23505') throw new Error(`Internal review event claim failed: ${claimError.message}`)
  if (claimError?.code === '23505') {
    const { data: existing, error } = await input.supabase.from('pipeline_events').select('status').eq('id', eventId).single()
    if (error) throw new Error(`Internal review event lookup failed: ${error.message}`)
    if (existing?.status === 'passed') return { status, reviewEventCreated: false, emailSent: false }
  }

  const sent = await input.sendInternalReview({
    from: 'BookLingua Admin <hello@booklingua.io>', to: [input.internalReviewAddress], subject: email.subject, html: email.html,
  }, { idempotencyKey: eventKey })
  const { error: updateError } = await input.supabase.from('pipeline_events').update({ status: 'passed', safe_message: 'INTERNAL_REVIEW_SENT', details: { eventKey, buildIdentity, templateVersion: email.templateVersion, providerMessageId: sent.id || null } }).eq('id', eventId)
  if (updateError) throw new Error(`Internal review event completion failed: ${updateError.message}`)
  return { status, reviewEventCreated: !claimError, emailSent: true }
}

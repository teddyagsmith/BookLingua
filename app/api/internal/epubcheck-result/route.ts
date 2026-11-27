import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { epubcheckWorkerAuthorized } from '@/lib/epubcheck-worker-auth'

export const runtime = 'nodejs'

type WorkerResult = { orderId?: string; language?: string; buildId?: string; artifactId?: string; sha256?: string; passed?: boolean; errors?: unknown[]; warnings?: unknown[]; output?: string }
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null

export async function POST(request: NextRequest) {
  if (!epubcheckWorkerAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as WorkerResult | null
  if (!body?.orderId || !body.language || !body.buildId || !body.artifactId || !body.sha256 || typeof body.passed !== 'boolean') return NextResponse.json({ error: 'Malformed result' }, { status: 400 })
  const errors = strings(body.errors); const warnings = strings(body.warnings)
  if (!errors || !warnings || typeof body.output !== 'string' || body.output.length > 100_000) return NextResponse.json({ error: 'Malformed diagnostics' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: artifact, error: artifactError } = await db.from('artifacts')
    .select('id,order_id,language,build_id,sha256,artifact_type,validation_status')
    .eq('id', body.artifactId).eq('order_id', body.orderId).eq('language', body.language).eq('build_id', body.buildId).maybeSingle()
  if (artifactError || !artifact || artifact.artifact_type !== 'final_epub' || artifact.validation_status !== 'pending' || artifact.sha256 !== body.sha256) return NextResponse.json({ error: 'Artifact identity mismatch' }, { status: 409 })
  const row = { order_id: body.orderId, language: body.language, build_id: body.buildId, artifact_id: body.artifactId, artifact_sha256: body.sha256, validator_version: '5.1.0', passed: body.passed, errors, warnings, output: body.output }
  const { error } = await db.from('epubcheck_results').insert(row)
  if (error && error.code !== '23505') return NextResponse.json({ error: 'Could not record EPUBCheck result' }, { status: 500 })
  if (error?.code === '23505') {
    const { data: existing } = await db.from('epubcheck_results').select('passed,artifact_sha256,errors,warnings').eq('artifact_id', body.artifactId).single()
    if (!existing || existing.passed !== body.passed || existing.artifact_sha256 !== body.sha256 || JSON.stringify(existing.errors) !== JSON.stringify(errors) || JSON.stringify(existing.warnings) !== JSON.stringify(warnings)) return NextResponse.json({ error: 'Conflicting immutable result' }, { status: 409 })
  }
  if (body.passed) await db.rpc('resolve_order_package_gate', { p_order_id: body.orderId })
  return NextResponse.json({ recorded: true, deliveryBlocked: !body.passed })
}

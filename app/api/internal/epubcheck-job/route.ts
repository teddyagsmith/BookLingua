import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ARTIFACT_BUCKET } from '@/lib/artifact-store'
import { epubcheckWorkerAuthorized } from '@/lib/epubcheck-worker-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!epubcheckWorkerAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { orderId?: string; language?: string; buildId?: string } | null
  if (!body?.orderId || !body.language || !body.buildId) return NextResponse.json({ error: 'orderId, language and buildId are required' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: artifact, error } = await db.from('artifacts')
    .select('id,order_id,language,build_id,storage_bucket,storage_path,sha256,validation_status,validation_reports!inner(metrics)')
    .eq('order_id', body.orderId).eq('language', body.language).eq('build_id', body.buildId)
    .eq('artifact_type', 'final_epub').maybeSingle()
  const metrics: any = Array.isArray((artifact as any)?.validation_reports) ? (artifact as any).validation_reports[0]?.metrics : (artifact as any)?.validation_reports?.metrics
  if (error || !artifact || artifact.storage_bucket !== ARTIFACT_BUCKET || artifact.validation_status !== 'pending' || metrics?.epubCheck?.status !== 'pending') {
    return NextResponse.json({ error: 'No pending EPUBCheck artifact found' }, { status: 404 })
  }
  const { data: signed, error: signedError } = await db.storage.from(ARTIFACT_BUCKET).createSignedUrl(artifact.storage_path, 300)
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'Unable to create artifact URL' }, { status: 500 })
  return NextResponse.json({ artifactId: artifact.id, sha256: artifact.sha256, downloadUrl: signed.signedUrl })
}

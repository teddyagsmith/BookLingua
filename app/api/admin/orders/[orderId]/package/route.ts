import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { assemblePackageManifest, evaluatePackageManifest } from '@/lib/package-manifest'
import { buildArtifactDownloadUrl } from '@/lib/download-token'
import { CUSTOMER_ARTIFACT_TYPES, customerLanguageName } from '@/lib/customer-delivery'

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  if (request.headers.get('x-admin-password') !== process.env.ADMIN_PASSWORD) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data: order } = await db.from('orders').select('id,status,languages').eq('id', params.orderId).maybeSingle()
  if (!order || order.status !== 'ready_for_review') return NextResponse.json({ error: 'Current package is not ready for review' }, { status: 409 })
  const artifacts: Array<{ language: string; label: string; url: string }> = []
  for (const language of (order.languages as string[]) || []) {
    const { data: build } = await db.from('order_language_builds').select('id').eq('order_id', order.id).eq('language', language).eq('is_current', true).maybeSingle()
    if (!build) return NextResponse.json({ error: `Current build unavailable for ${language}` }, { status: 409 })
    const manifest = await assemblePackageManifest({ supabase: db, orderId: order.id, language, buildId: build.id })
    if (evaluatePackageManifest(manifest).status !== 'pass') return NextResponse.json({ error: `Current package unavailable for ${language}` }, { status: 409 })
    for (const artifact of manifest.artifacts.filter(item => CUSTOMER_ARTIFACT_TYPES.includes(item.type as any))) {
      artifacts.push({ language: customerLanguageName(language), label: artifact.type, url: buildArtifactDownloadUrl(order.id, language, artifact.type) })
    }
  }
  return NextResponse.json({ artifacts })
}

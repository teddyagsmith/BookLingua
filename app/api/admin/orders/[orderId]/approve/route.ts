import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildDownloadUrl } from '@/lib/download-token'
import { runMandatoryQA } from '@/lib/delivery-gate'
import { Resend } from 'resend'
import fs from 'fs'
import path from 'path'
import { assemblePackageManifest, evaluatePackageManifest } from '@/lib/package-manifest'
import { HARDENED_V1_ENABLED } from '@/lib/pipeline-capabilities'
import { HARDENED_EXTERNAL_DELIVERY_ENABLED } from '@/lib/hardened-delivery-capability'

let resend: Resend | null = null
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return resend
}

const LANGUAGE_NAMES: Record<string, string> = {
  'es-es': 'Spanish (Spain)',
  'es-latam': 'Spanish (Latin America)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  'pt-pt': 'Portuguese (Portugal)',
  'pt-br': 'Portuguese (Brazil)',
  pt: 'Portuguese',
  it: 'Italian',
  pl: 'Polish',
  ja: 'Japanese',
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const auth = request.headers.get('x-admin-password')
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orderId } = params

  try {
    const { data: order, error } = await getSupabaseAdmin()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (!['pending_review', 'ready_for_review', 'delivery_pending'].includes(order.status)) {
      return NextResponse.json({ error: 'Order is not pending review' }, { status: 400 })
    }

    const languages = (order.languages as string[]) || []
    if (['ready_for_review', 'delivery_pending'].includes(order.status)) {
      if (!HARDENED_V1_ENABLED) return NextResponse.json({ error: 'Hardened package capability is disabled' }, { status: 409 })
      for (const language of languages) {
        const { data: currentBuild } = await getSupabaseAdmin().from('order_language_builds')
          .select('id').eq('order_id', orderId).eq('language', language).eq('is_current', true).maybeSingle()
        if (!currentBuild) return NextResponse.json({ error: `Current build unavailable for ${language}` }, { status: 409 })
        const { data: row } = await getSupabaseAdmin().from('package_manifests')
          .select('build_id, status').eq('order_id', orderId).eq('language', language)
          .eq('build_id', currentBuild.id).maybeSingle()
        if (!row || row.status !== 'pass') return NextResponse.json({ error: `Package is not passed for ${language}` }, { status: 409 })
        const authoritative = await assemblePackageManifest({ supabase: getSupabaseAdmin(), orderId, language, buildId: row.build_id })
        if (evaluatePackageManifest(authoritative).status !== 'pass') return NextResponse.json({ error: `Package changed or is incomplete for ${language}` }, { status: 409 })
      }
      const { data: deliveryEventId, error: deliveryError } = await getSupabaseAdmin().rpc('begin_hardened_delivery', { p_order_id: orderId })
      if (deliveryError) return NextResponse.json({ error: 'Package state changed before approval' }, { status: 409 })
      if (!HARDENED_EXTERNAL_DELIVERY_ENABLED) {
        return NextResponse.json({ success: true, approved: true, externalDelivery: 'pending_disabled', emailSent: false }, { status: 202 })
      }
      ;(order as any).delivery_event_id = deliveryEventId
    }
    const downloadLinks = languages.map((lang: string) => ({
      language: LANGUAGE_NAMES[lang] || lang,
      reviewUrl: buildDownloadUrl(orderId, lang, 'review'),
      finalUrl: buildDownloadUrl(orderId, lang, 'final'),
    }))

    // Legacy pending_review orders retain the existing text gate. Hardened
    // ready_for_review orders were revalidated from immutable package rows above.
    if (order.status === 'pending_review') {
      const tmpDir = `/tmp/booklingua-qa-${orderId}`
      fs.mkdirSync(tmpDir, { recursive: true })

      // Fetch original content
      const { data: originalFile } = await getSupabaseAdmin()
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'original')
      .maybeSingle()

      const originalPath = path.join(tmpDir, 'original.txt')
      fs.writeFileSync(originalPath, originalFile?.content || '')

      let qaErrors: string[] = []

      for (const lang of languages) {
      const { data: translatedFile } = await getSupabaseAdmin()
        .from('files')
        .select('content')
        .eq('order_id', orderId)
        .eq('language', lang)
        .eq('type', 'translated')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!translatedFile?.content) {
        qaErrors.push(`No translated content found for ${lang}`)
        continue
      }

      const translatedPath = path.join(tmpDir, `translated-${lang}.txt`)
      fs.writeFileSync(translatedPath, translatedFile.content)

      const qa = runMandatoryQA(originalPath, translatedPath, 'clean', lang)
      if (!qa.passed) {
        qaErrors.push(...qa.errors)
      }
      }

    // Clean up temp files
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

      if (qaErrors.length > 0) {
      await getSupabaseAdmin()
        .from('orders')
        .update({
          status: 'qa_blocked',
          qa_errors: qaErrors.join('\n\n'),
        })
        .eq('id', orderId)

      console.error(`[QA BLOCKED] Order ${orderId}:`, qaErrors)
      return NextResponse.json(
        { error: 'QA check failed', details: qaErrors },
        { status: 400 }
      )
      }
    }
    // ── END MANDATORY QA GATE ──

    // Fetch the pre-composed customer email from the files table
    // This is the EXACT email Gilly reviewed — now sent to the customer
    const { data: emailFile } = await getSupabaseAdmin()
      .from('files')
      .select('content')
      .eq('order_id', orderId)
      .eq('type', 'customer_email')
      .maybeSingle()

    const customerEmailHtml = emailFile?.content || `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>
        <p>Hi ${order.author_name || 'there'},</p>
        <p>Your translations for <strong>${order.book_title}</strong> are complete.</p>
        <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Download Your Translations</h3>
          ${downloadLinks.map((link: { language: string; reviewUrl: string; finalUrl: string }) => `
            <div style="margin: 14px 0; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-weight: bold; color: #111;">${link.language}</p>
              <p style="margin: 0 0 4px 0;">📝 <a href="${link.reviewUrl}" style="color: #7c3aed; text-decoration: none; font-weight: 500;">Review Version</a></p>
              <p style="margin: 0;">✅ <a href="${link.finalUrl}" style="color: #059669; text-decoration: none; font-weight: 500;">Final Version</a></p>
            </div>
          `).join('')}
        </div>
        <p>Happy publishing!<br>The BookLingua Team</p>
      </div>
    `

    // Send the exact same email to the customer
    const { error: sendError, data: sendData } = await getResend().emails.send({
      from: 'BookLingua <orders@booklingua.io>',
      to: order.email,
      subject: `Your translations are ready: ${order.book_title} 🎉`,
      html: customerEmailHtml,
    }, order.status === 'pending_review' ? undefined : { idempotencyKey: `delivery/${(order as any).delivery_event_id}` })
    if (sendError) throw new Error('Customer delivery email failed')

    if (order.status !== 'pending_review') {
      const { error: eventError } = await getSupabaseAdmin().from('delivery_events')
        .update({ state: 'sent', provider_message_id: sendData?.id || null, sent_at: new Date().toISOString(), attempt_count: 1 })
        .eq('order_id', orderId).eq('state', 'pending')
      if (eventError) throw new Error('Delivery event finalization failed')
    }

    // Mark order as completed
    const expectedStatus = order.status === 'pending_review' ? 'pending_review' : 'delivery_pending'
    const { data: completedOrder, error: completedError } = await getSupabaseAdmin()
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', expectedStatus)
      .select('id')
      .maybeSingle()
    if (completedError || !completedOrder) throw new Error('Delivery completion state update failed')

    return NextResponse.json({ success: true, emailSent: true })
  } catch (err) {
    console.error('Approve order error:', err)
    return NextResponse.json({ error: 'Failed to approve order' }, { status: 500 })
  }
}

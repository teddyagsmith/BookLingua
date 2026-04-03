import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildDownloadUrl } from '@/lib/download-token'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.status !== 'pending_review') {
      return NextResponse.json({ error: 'Order is not pending review' }, { status: 400 })
    }

    const languages = (order.languages as string[]) || []
    const downloadLinks = languages.map((lang: string) => ({
      language: LANGUAGE_NAMES[lang] || lang,
      reviewUrl: buildDownloadUrl(orderId, lang, 'review'),
      finalUrl: buildDownloadUrl(orderId, lang, 'final'),
    }))

    // Send customer completion email
    await resend.emails.send({
      from: 'BookLingua <orders@booklingua.io>',
      to: order.email,
      subject: `Your translations are ready: ${order.book_title} 🎉`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>

          <p>Hi ${order.author_name},</p>

          <p>Great news! Your translations for <strong>${order.book_title}</strong> are complete and ready for download.</p>

          <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Download Your Translations</h3>
            ${downloadLinks.map((link: { language: string; reviewUrl: string; finalUrl: string }) => `
              <div style="margin: 14px 0; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #111;">${link.language}</p>
                <p style="margin: 0 0 4px 0;">
                  📝 <a href="${link.reviewUrl}" style="color: #7c3aed; text-decoration: none; font-weight: 500;">Review Version (with highlights)</a>
                  <span style="color: #6b7280; font-size: 12px;"> — see every editorial change in yellow</span>
                </p>
                <p style="margin: 0;">
                  ✅ <a href="${link.finalUrl}" style="color: #059669; text-decoration: none; font-weight: 500;">Final Version (clean, publish-ready)</a>
                  <span style="color: #6b7280; font-size: 12px;"> — ready to upload to KDP or your publisher</span>
                </p>
              </div>
            `).join('')}
          </div>

          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>📝 Two files per language — here's how to use them:</strong><br><br>
              <strong>Review Version</strong> — Yellow highlighted text is the first-pass translation. The clean text after it is our editorial improvement. Use this to approve every change before publishing.<br><br>
              <strong>Final Version</strong> — Clean, publish-ready. No highlights. Ready to upload directly to KDP, Atticus, Vellum, or your publisher.
            </p>
          </div>

          <p>Download links expire in 7 days. Need them resent? Just reply to this email.</p>

          <p>Happy publishing!<br>The BookLingua Team</p>
        </div>
      `,
    })

    // Mark order as completed
    await supabaseAdmin
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Approve order error:', err)
    return NextResponse.json({ error: 'Failed to approve order' }, { status: 500 })
  }
}

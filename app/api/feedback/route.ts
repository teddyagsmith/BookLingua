import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createHmac } from 'crypto'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function signFeedbackToken(orderId: string): string {
  return createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`feedback:${orderId}`)
    .digest('hex')
    .slice(0, 32)
}

const STARS: Record<number, string> = {
  1: '⭐',
  2: '⭐⭐',
  3: '⭐⭐⭐',
  4: '⭐⭐⭐⭐',
  5: '⭐⭐⭐⭐⭐',
}

function thankYouPage(rating: number, bookTitle: string): string {
  const isLow = rating < 4
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You — BookLingua</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f3ff; margin: 0; padding: 40px 20px; }
    .card { background: white; border-radius: 16px; padding: 48px; max-width: 520px; margin: 0 auto; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { color: #7c3aed; margin-bottom: 8px; }
    .stars { font-size: 32px; margin: 16px 0; }
    p { color: #374151; line-height: 1.6; }
    .cta { display: inline-block; margin-top: 24px; background: #7c3aed; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .low { background: #fef3c7; border-radius: 8px; padding: 16px; margin-top: 16px; color: #92400e; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Thank you! 🙏</h1>
    <div class="stars">${STARS[rating]}</div>
    <p>You rated your <strong>${bookTitle}</strong> translation <strong>${rating}/5</strong>.</p>
    ${isLow
      ? `<div class="low">We're sorry it didn't hit the mark. Our team will review your order and reach out shortly to make it right.</div>`
      : `<p>Glad we could deliver! Ready to translate your backlist?</p>
         <a class="cta" href="https://booklingua.io">Translate another book →</a>`
    }
    ${!isLow ? `<p style="margin-top: 24px; font-size: 14px; color: #6b7280;">Got a full backlist? <a href="mailto:hello@booklingua.io" style="color: #7c3aed;">Contact us for a bulk quote.</a></p>` : ''}
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const orderId  = searchParams.get('orderId')
  const ratingStr = searchParams.get('rating')
  const token    = searchParams.get('token')

  if (!orderId || !ratingStr || !token) {
    return new NextResponse('Missing parameters', { status: 400 })
  }

  const rating = parseInt(ratingStr, 10)
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return new NextResponse('Invalid rating', { status: 400 })
  }

  // Validate token
  const expected = signFeedbackToken(orderId)
  if (token !== expected) {
    return new NextResponse('Invalid token', { status: 403 })
  }

  // Get order
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('book_title, author_name, email, languages')
    .eq('id', orderId)
    .single()

  if (!order) return new NextResponse('Order not found', { status: 404 })

  // Idempotent: skip if already rated
  const { data: existing } = await supabaseAdmin
    .from('order_feedback')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle()

  if (!existing) {
    // Save feedback
    await supabaseAdmin.from('order_feedback').insert({
      order_id: orderId,
      rating,
    })

    // Alert admin if rating < 4
    if (rating < 4) {
      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.io>',
        to: 'hello@booklingua.io',
        subject: `⚠️ Low Rating (${rating}/5) — ${order.book_title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #dc2626;">⚠️ Low Rating Alert — ${rating}/5 ${STARS[rating]}</h2>
            <p><strong>Book:</strong> ${order.book_title}</p>
            <p><strong>Customer:</strong> ${order.author_name} (${order.email})</p>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Languages:</strong> ${(order.languages as string[]).join(', ').toUpperCase()}</p>
            <hr>
            <p>Please review the translation and reach out to the customer to understand the issue and offer a resolution.</p>
            <p><a href="https://supabase.com/dashboard/project/rtpoizdvgqwazizdqmyw/editor" style="color: #7c3aed;">View in Supabase →</a></p>
          </div>
        `,
      })
    }
  }

  return new NextResponse(thankYouPage(rating, order.book_title), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

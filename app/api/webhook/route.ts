import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { inngest } from '@/lib/inngest'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return _resend
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // Idempotency check: ignore duplicate webhook events for the same Stripe session
    const { data: existingOrder } = await getSupabaseAdmin()
      .from('orders')
      .select('id')
      .eq('stripe_session_id', session.id)
      .maybeSingle()

    if (existingOrder) {
      console.log(`Webhook already processed for session ${session.id}, order ${existingOrder.id}. Skipping.`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    const {
      authorName,
      bookTitle,
      wordCount,
      tier,
      fileFormat,
      selectedLanguages,
      selectedGenre,
      heatLevel,
      selectedUpsells,
      specialInstructions,
      sessionId,
      book_setting,
    } = session.metadata!

    const customerEmail = session.customer_email!
    const languages = JSON.parse(selectedLanguages)
    const upsells = JSON.parse(selectedUpsells || '[]')

    // 1. Create order in Supabase
    const { data: order, error: orderError } = await getSupabaseAdmin()
      .from('orders')
      .insert({
        stripe_session_id: session.id,
        email: customerEmail,
        author_name: authorName,
        book_title: bookTitle,
        word_count: parseInt(wordCount),
        tier,
        file_format: fileFormat,
        languages,
        genre: selectedGenre,
        upsells,
        special_instructions: specialInstructions || null,
        amount_paid: session.amount_total! / 100,
        status: 'pending',
      })
      .select()
      .single()

    if (orderError) {
      console.error('Failed to create order:', orderError)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // 2. Link uploaded file from temp_uploads to the order's files table
    if (sessionId) {
      const { data: tempUpload } = await getSupabaseAdmin()
        .from('temp_uploads')
        .select('*')
        .eq('session_id', sessionId)
        .single()

      if (tempUpload) {
        await getSupabaseAdmin().from('files').insert({
          order_id: order.id,
          type: 'original',
          language: 'en',
          content: tempUpload.content,
        })

        // Carry over pre-payment glossary decisions and cultural terms if present
        if (tempUpload.glossary_decisions) {
          await getSupabaseAdmin().from('files').insert({
            order_id: order.id,
            type: 'glossary',
            language: 'en',
            content: JSON.stringify(tempUpload.glossary_decisions),
          })
        }
        if (tempUpload.cultural_terms) {
          await getSupabaseAdmin().from('files').insert({
            order_id: order.id,
            type: 'cultural_terms',
            language: 'en',
            content: JSON.stringify(tempUpload.cultural_terms),
          })
        }

        // Clean up temp upload
        await getSupabaseAdmin().from('temp_uploads').delete().eq('session_id', sessionId)
      } else {
        console.error(`No temp upload found for sessionId: ${sessionId}`)
      }
    }

    // 3. Send confirmation email to customer
    await getResend().emails.send({
      from: 'BookLingua <orders@booklingua.io>',
      to: customerEmail,
      subject: `Order Confirmed: ${bookTitle} Translation`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Thank you for your order! 📚</h1>
          
          <p>Hi ${authorName},</p>
          
          <p>We've received your order and are starting the translation process for <strong>${bookTitle}</strong>.</p>
          
          <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Order Details</h3>
            <p><strong>Book:</strong> ${bookTitle}</p>
            <p><strong>Word Count:</strong> ${parseInt(wordCount).toLocaleString()} (${tier})</p>
            <p><strong>Format:</strong> ${fileFormat.toUpperCase()}</p>
            <p><strong>Languages:</strong> ${languages.join(', ').toUpperCase()}</p>
            <p><strong>Order ID:</strong> ${order.id}</p>
          </div>
          
          <h3>What happens next?</h3>
          <ol>
            <li><strong>Translation (1-2 hours):</strong> Our AI translates your manuscript while preserving formatting</li>
            <li><strong>Editorial Review (30-60 mins):</strong> Premium AI reviews for cultural accuracy and natural phrasing</li>
            <li><strong>Delivery:</strong> You'll receive an email with download links</li>
          </ol>
          
          <p>We'll email you when your translations are ready!</p>
          
          <p>Best,<br>The BookLingua Team</p>
        </div>
      `,
    })

    // 4. Send notification to admin
    await getResend().emails.send({
      from: 'BookLingua <orders@booklingua.io>',
      to: process.env.ADMIN_EMAIL!,
      subject: `🎉 New Order: ${bookTitle} - $${(session.amount_total! / 100).toFixed(2)}`,
      html: `
        <h2>New Translation Order!</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Customer:</strong> ${authorName} (${customerEmail})</p>
        <p><strong>Book:</strong> ${bookTitle}</p>
        <p><strong>Words:</strong> ${parseInt(wordCount).toLocaleString()} (${tier})</p>
        <p><strong>Format:</strong> ${fileFormat}</p>
        <p><strong>Languages:</strong> ${languages.join(', ')}</p>
        <p><strong>Genre:</strong> ${selectedGenre}</p>
        <p><strong>Upsells:</strong> ${upsells.length > 0 ? upsells.join(', ') : 'None'}</p>
        <p><strong>Special Instructions:</strong> ${specialInstructions || 'None'}</p>
        <p><strong>Total:</strong> $${(session.amount_total! / 100).toFixed(2)}</p>
        <hr>
        <p>Translation will start automatically.</p>
      `,
    })

    // 5. Trigger automatic translation via Inngest
    await inngest.send({
      name: 'book/translate.requested',
      data: {
        orderId: order.id,
        heatLevel: heatLevel || null,
        bookSetting: book_setting || null,
      },
    })

    console.log(`Order ${order.id} created and translation triggered`)
  }

  return NextResponse.json({ received: true })
}

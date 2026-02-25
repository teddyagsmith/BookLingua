import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { inngest } from '@/lib/inngest'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const resend = new Resend(process.env.RESEND_API_KEY)

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
    
    const {
      authorName,
      bookTitle,
      wordCount,
      tier,
      fileFormat,
      selectedLanguages,
      selectedGenre,
      selectedUpsells,
      specialInstructions,
    } = session.metadata!

    const customerEmail = session.customer_email!
    const languages = JSON.parse(selectedLanguages)
    const upsells = JSON.parse(selectedUpsells || '[]')

    // 1. Create order in Supabase
    const { data: order, error: orderError } = await supabaseAdmin
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

    // 2. Send confirmation email to customer
    await resend.emails.send({
      from: 'BookLingua <orders@booklingua.com>',
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
            <li><strong>Translation (2-3 days):</strong> Your book is being translated while preserving formatting</li>
            <li><strong>Editorial Review (1-2 days):</strong> Premium review with changes highlighted in yellow</li>
            <li><strong>Delivery:</strong> You'll receive an email with download links</li>
          </ol>
          
          <p>We'll email you when your translations are ready!</p>
          
          <p>Best,<br>The BookLingua Team</p>
        </div>
      `,
    })

    // 3. Send notification to admin
    await resend.emails.send({
      from: 'BookLingua <orders@booklingua.com>',
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

    // 4. Trigger automatic translation via Inngest
    await inngest.send({
      name: 'book/translate.requested',
      data: {
        orderId: order.id,
      },
    })

    console.log(`Order ${order.id} created and translation triggered`)
  }

  return NextResponse.json({ received: true })
}

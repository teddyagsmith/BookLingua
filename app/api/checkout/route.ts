import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import { inngest } from '@/lib/inngest'
import { linkSourceUploadToOrder } from '@/lib/link-source-upload'
import { verifyUploadIdentity } from '@/lib/upload-identity'
import { HARDENED_V1_ENABLED } from '@/lib/pipeline-capabilities'
import { assertHardenedUploadReady } from '@/lib/hardened-upload'
import { Resend } from 'resend'
import { newOrderPipelineFields } from '@/lib/customer-package-version'
import { bundleDiscountPercent } from '@/lib/bundle-pricing'
import { CORE_LANGUAGE_CODES } from '@/lib/languages'
import { WORD_TIERS, pricingTierForWordCount, PricingTierKey } from '@/lib/pricing'

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

async function sendOrderConfirmationAndNotifyAdmin(order: any, sessionMetadata: { bookTitle: string; wordCount: string | number; fileFormat: string; languages: string[]; selectedGenre: string; upsells: string[]; specialInstructions?: string | null; amountPaid: number; authorName: string; customerEmail: string; heatLevel?: string | null; bookSetting?: string | null }) {
  const {
    bookTitle,
    wordCount,
    fileFormat,
    languages,
    selectedGenre,
    upsells,
    specialInstructions,
    amountPaid,
    authorName,
    customerEmail,
  } = sessionMetadata

  // Customer confirmation
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
          <p><strong>Word Count:</strong> ${parseInt(wordCount as unknown as string, 10).toLocaleString()}</p>
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

  // Admin notification
  await getResend().emails.send({
    from: 'BookLingua <orders@booklingua.io>',
    to: process.env.ADMIN_EMAIL!,
    subject: `🎉 New Order: ${bookTitle} - $${amountPaid.toFixed(2)}`,
    html: `
      <h2>New Translation Order!</h2>
      <p><strong>Order ID:</strong> ${order.id}</p>
      <p><strong>Customer:</strong> ${authorName} (${customerEmail})</p>
      <p><strong>Book:</strong> ${bookTitle}</p>
      <p><strong>Words:</strong> ${parseInt(wordCount as unknown as string, 10).toLocaleString()}</p>
      <p><strong>Format:</strong> ${fileFormat}</p>
      <p><strong>Languages:</strong> ${languages.join(', ')}</p>
      <p><strong>Genre:</strong> ${selectedGenre}</p>
      <p><strong>Upsells:</strong> ${upsells.length > 0 ? upsells.join(', ') : 'None'}</p>
      <p><strong>Special Instructions:</strong> ${specialInstructions || 'None'}</p>
      <p><strong>Total:</strong> $${amountPaid.toFixed(2)}</p>
      <hr>
      <p>Translation will start automatically.</p>
    `,
  })
}


// Voucher codes - add/remove codes here
const VOUCHER_CODES: Record<string, { discount: number; type: 'percent' | 'fixed'; description: string; maxUses?: number; expiresAt?: string; oncePerEmail?: boolean }> = {
  'LAUNCH20': { discount: 20, type: 'percent', description: '20% off launch discount', oncePerEmail: true },
  'FIRST50': { discount: 50, type: 'fixed', description: '$50 off first order', oncePerEmail: true },
  'FRIEND10': { discount: 10, type: 'percent', description: '10% friend referral', oncePerEmail: true },
  'AUTHOR25': { discount: 25, type: 'percent', description: '25% author discount', oncePerEmail: true },
  'BETA95': { discount: 95, type: 'percent', description: '95% beta tester discount', oncePerEmail: true },
  'TESTDRIVE': { discount: 90, type: 'percent', description: '90% test discount', oncePerEmail: true },
  'X7KQ9M2P': { discount: 100, type: 'percent', description: '100% internal test discount', oncePerEmail: false },
}

async function validateVoucher(code: string, subtotal: number, email?: string): Promise<{ valid: boolean; discountAmount: number; error?: string }> {
  const upperCode = code.toUpperCase().trim()
  const voucher = VOUCHER_CODES[upperCode]
  
  if (!voucher) {
    return { valid: false, discountAmount: 0, error: 'Invalid voucher code' }
  }
  
  // Check expiry if set
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    return { valid: false, discountAmount: 0, error: 'Voucher has expired' }
  }

  // Check once-per-email restriction
  if (voucher.oncePerEmail && email) {
    const { data: previousOrder } = await getSupabaseAdmin()
      .from('orders')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('voucher_code', upperCode)
      .maybeSingle()

    if (previousOrder) {
      return { valid: false, discountAmount: 0, error: 'This voucher has already been used with this email address' }
    }
  }
  
  // Calculate discount
  let discountAmount = 0
  if (voucher.type === 'percent') {
    discountAmount = subtotal * (voucher.discount / 100)
  } else {
    discountAmount = Math.min(voucher.discount, subtotal) // Don't exceed subtotal
  }
  
  return { valid: true, discountAmount }
}

// Server-side price calculation — NEVER trust client-submitted prices
function calculateServerPrice(
  tier: PricingTierKey,
  selectedLanguages: string[],
  selectedUpsells: string[],
): { total: number; nonVoucherable: number } {
  const tierInfo = WORD_TIERS[tier]
  if (!tierInfo) throw new Error(`Invalid tier: ${tier}`)

  const numLanguages = selectedLanguages.length
  if (numLanguages === 0) throw new Error('No languages selected')

  const discountPct = bundleDiscountPercent(numLanguages)
  const baseTotal = tierInfo.basePrice * numLanguages
  const translationTotal = baseTotal * (1 - discountPct / 100)

  let upsellTotal = 0
  let nonVoucherable = 0
  for (const id of selectedUpsells) {
    if (id === 'launch-pack') {
      const cost = numLanguages > 1 ? 49 : 29
      upsellTotal += cost
      nonVoucherable += cost
    }
    else if (id === 'mrr-shoutout') {
      upsellTotal += 69
      nonVoucherable += 69
    }
    else if (id === 'dual-format') upsellTotal += 29
  }

  const total = Math.round((translationTotal + upsellTotal) * 100) / 100
  return { total, nonVoucherable }
}

// Validate that the submitted tier matches the word count
function determineTierFromWordCount(wordCount: number): PricingTierKey {
  const tier = pricingTierForWordCount(wordCount)
  if (!tier) throw new Error('Word count is outside standard pricing')
  return tier.key
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email,
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
      voucherCode,
      sessionId,
      uploadToken,
      bookSetting,
      affiliateCode,
    } = body
    if (HARDENED_V1_ENABLED && !verifyUploadIdentity(sessionId, uploadToken)) {
      return NextResponse.json({ error: 'Invalid or expired upload session' }, { status: 403 })
    }

    let authoritativeUpload: any = null
    if (HARDENED_V1_ENABLED) {
      const { data, error } = await getSupabaseAdmin().from('temp_uploads')
        .select('session_id, file_format, word_count, source_storage_path, source_storage_bucket, source_sha256, source_size_bytes, source_manifest, glossary_saved_at')
        .eq('session_id', sessionId).maybeSingle()
      try { if (error) throw error; assertHardenedUploadReady(data, sessionId) }
      catch {
        return NextResponse.json({ error: 'The uploaded source or translation brief is incomplete. Please upload again.' }, { status: 409 })
      }
      authoritativeUpload = data
    }

    const authoritativeWordCount = authoritativeUpload ? Number(authoritativeUpload.word_count) : Number(wordCount)
    const authoritativeFileFormat = authoritativeUpload ? String(authoritativeUpload.file_format) : String(fileFormat)
    if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0
      || selectedLanguages.some(language => typeof language !== 'string' || !/^[a-z]{2}(?:-[a-z]{2,5})?$/i.test(language))
      || selectedLanguages.some(language => !CORE_LANGUAGE_CODES.has(language))
      || new Set(selectedLanguages).size !== selectedLanguages.length) {
      return NextResponse.json({ error: 'Invalid target languages' }, { status: 400 })
    }

    // ✅ SECURITY: Recalculate price server-side — ignore any client-submitted totalAmount
    // Also validate tier against word count — correct it if client sent wrong tier
    let validatedTier: PricingTierKey
    try {
      validatedTier = determineTierFromWordCount(authoritativeWordCount)
    } catch {
      return NextResponse.json({ error: 'Manuscripts over 150,000 words require a tailored quote.' }, { status: 400 })
    }
    if (tier !== validatedTier) {
      console.warn(`Tier mismatch: client sent ${tier} for ${wordCount} words, corrected to ${validatedTier}`)
    }

    let serverCalculatedAmount: number
    let nonVoucherable: number
    try {
      const result = calculateServerPrice(validatedTier, selectedLanguages, selectedUpsells || [])
      serverCalculatedAmount = result.total
      nonVoucherable = result.nonVoucherable
    } catch (e) {
      return NextResponse.json({ error: 'Invalid order configuration' }, { status: 400 })
    }

    let finalAmount = serverCalculatedAmount
    let appliedVoucher = null

    if (voucherCode) {
      const voucherableAmount = Math.max(serverCalculatedAmount - nonVoucherable, 0)
      const voucherResult = await validateVoucher(voucherCode, voucherableAmount, email)
      if (voucherResult.valid) {
        finalAmount = serverCalculatedAmount - voucherResult.discountAmount
        appliedVoucher = voucherCode.toUpperCase()
      }
    }

    // Ensure minimum charge of $1 (unless 100% discount)
    const isFullyFree = appliedVoucher && finalAmount <= 0
    finalAmount = Math.max(finalAmount, 1)

    // Handle 100% free orders — skip Stripe, create order directly
    if (isFullyFree) {
      const orderData = {
        stripe_session_id: 'FREE-' + crypto.randomUUID(),
        email: email.toLowerCase().trim(),
        author_name: authorName,
        book_title: bookTitle,
        word_count: authoritativeWordCount,
        tier: validatedTier,
        file_format: authoritativeFileFormat,
        languages: selectedLanguages,
        genre: selectedGenre || null,
        upsells: selectedUpsells || [],
        special_instructions: specialInstructions || null,
        amount_paid: 0,
        status: 'pending',
        ...newOrderPipelineFields(),
      }

      const { data: order, error: orderError } = await getSupabaseAdmin()
        .from('orders')
        .insert(orderData)
        .select()
        .single()

      if (orderError) {
        console.error('Free order insert error:', orderError)
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }

      // Link temp upload file
      if (sessionId) {
        const { data: tempUpload } = await getSupabaseAdmin()
          .from('temp_uploads')
          .select('*')
          .eq('session_id', sessionId)
          .single()

        if (tempUpload) {
          try {
            await linkSourceUploadToOrder(getSupabaseAdmin(), order.id, tempUpload, selectedLanguages)
          } catch (linkError) {
            if (HARDENED_V1_ENABLED) await getSupabaseAdmin().from('orders').delete().eq('id', order.id).eq('status', 'pending')
            throw linkError
          }

          // Carry over pre-payment glossary decisions and cultural terms if present
          if (!HARDENED_V1_ENABLED && tempUpload.glossary_decisions) {
            await getSupabaseAdmin().from('files').insert({
              order_id: order.id,
              type: 'glossary',
              language: 'en',
              content: JSON.stringify(tempUpload.glossary_decisions),
            })
          }
          if (!HARDENED_V1_ENABLED && tempUpload.cultural_terms) {
            await getSupabaseAdmin().from('files').insert({
              order_id: order.id,
              type: 'cultural_terms',
              language: 'en',
              content: JSON.stringify(tempUpload.cultural_terms),
            })
          }

          if (!HARDENED_V1_ENABLED) await getSupabaseAdmin().from('temp_uploads').delete().eq('session_id', sessionId)
        }
      }

      // Send customer confirmation and admin notification for free orders
      await sendOrderConfirmationAndNotifyAdmin(order, {
        bookTitle,
        wordCount: authoritativeWordCount,
        fileFormat: authoritativeFileFormat,
        languages: selectedLanguages,
        selectedGenre: selectedGenre || '',
        upsells: selectedUpsells || [],
        specialInstructions: specialInstructions || null,
        amountPaid: 0,
        authorName,
        customerEmail: email.toLowerCase().trim(),
        heatLevel: heatLevel || null,
        bookSetting: bookSetting || null,
      })

      // Trigger automatic translation
      await inngest.send({
        name: 'book/translate.requested',
        data: {
          orderId: order.id,
          heatLevel: heatLevel || null,
          bookSetting: bookSetting || null,
        },
      })

      console.log(`Free order ${order.id} created and translation triggered`)

      return NextResponse.json({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id=FREE&order_id=${order.id}`,
        freeOrder: true,
      })
    }

    // Create line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Book Translation: ${bookTitle}`,
            description: `${authoritativeWordCount.toLocaleString()} words (${validatedTier}) → ${selectedLanguages.join(', ').toUpperCase()} • ${authoritativeFileFormat.toUpperCase()} format preserved${appliedVoucher ? ` • Voucher: ${appliedVoucher}` : ''}`,
          },
          unit_amount: Math.round(finalAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ]

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}`,
      customer_email: email,
      metadata: {
        authorName,
        bookTitle,
        wordCount: authoritativeWordCount.toString(),
        tier: validatedTier,
        fileFormat: authoritativeFileFormat,
        selectedLanguages: JSON.stringify(selectedLanguages),
        selectedGenre,
        heatLevel: heatLevel || '',
        selectedUpsells: JSON.stringify(selectedUpsells),
        originalAmount: serverCalculatedAmount.toString(),
        voucherCode: appliedVoucher || '',
        finalAmount: finalAmount.toString(),
        sessionId: sessionId || '',
        uploadToken: uploadToken || '',
        specialInstructions: (specialInstructions || '').slice(0, 490), // Stripe 500 char limit
        book_setting: (bookSetting || '').slice(0, 490),
        affiliateCode: (affiliateCode || '').toUpperCase(),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

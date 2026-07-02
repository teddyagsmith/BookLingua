import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

import { getSupabaseAdmin } from '@/lib/supabase'

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
const WORD_TIERS: Record<string, { maxWords: number; basePrice: number }> = {
  small:  { maxWords: 40000,  basePrice: 99  },
  medium: { maxWords: 80000,  basePrice: 149 },
  large:  { maxWords: 150000, basePrice: 199 },
}

const BUNDLE_DISCOUNTS: Record<number, number> = {
  1: 0, 2: 12, 3: 25, 4: 30, 5: 35, 6: 40,
}

function calculateServerPrice(
  tier: string,
  selectedLanguages: string[],
  selectedUpsells: string[],
): { total: number; nonVoucherable: number } {
  const tierInfo = WORD_TIERS[tier]
  if (!tierInfo) throw new Error(`Invalid tier: ${tier}`)

  const numLanguages = selectedLanguages.length
  if (numLanguages === 0) throw new Error('No languages selected')

  const discountPct = BUNDLE_DISCOUNTS[Math.min(numLanguages, 6)] ?? 0
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
function determineTierFromWordCount(wordCount: number): string {
  if (wordCount <= 40000) return 'small'
  if (wordCount <= 80000) return 'medium'
  return 'large'
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
      bookSetting,
      affiliateCode,
    } = body

    // ✅ SECURITY: Recalculate price server-side — ignore any client-submitted totalAmount
    // Also validate tier against word count — correct it if client sent wrong tier
    const validatedTier = determineTierFromWordCount(wordCount)
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
        word_count: wordCount,
        tier: validatedTier,
        file_format: fileFormat,
        languages: selectedLanguages,
        genre: selectedGenre,
        upsells: selectedUpsells || [],
        heat_level: heatLevel || null,
        book_setting: bookSetting || null,
        special_instructions: specialInstructions || '',
        amount_paid: 0,
        status: 'pending',
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
          await getSupabaseAdmin().from('files').insert({
            order_id: order.id,
            type: 'original',
            language: 'en',
            content: tempUpload.content,
          })
          await getSupabaseAdmin().from('temp_uploads').delete().eq('session_id', sessionId)
        }
      }

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
            description: `${wordCount.toLocaleString()} words (${validatedTier}) → ${selectedLanguages.join(', ').toUpperCase()} • ${fileFormat.toUpperCase()} format preserved${appliedVoucher ? ` • Voucher: ${appliedVoucher}` : ''}`,
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
        wordCount: wordCount.toString(),
        tier: validatedTier,
        fileFormat,
        selectedLanguages: JSON.stringify(selectedLanguages),
        selectedGenre,
        heatLevel: heatLevel || '',
        selectedUpsells: JSON.stringify(selectedUpsells),
        originalAmount: serverCalculatedAmount.toString(),
        voucherCode: appliedVoucher || '',
        finalAmount: finalAmount.toString(),
        sessionId: sessionId || '',
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

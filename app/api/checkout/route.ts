import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Voucher codes - add/remove codes here
const VOUCHER_CODES: Record<string, { discount: number; type: 'percent' | 'fixed'; description: string; maxUses?: number; expiresAt?: string }> = {
  'LAUNCH20': { discount: 20, type: 'percent', description: '20% off launch discount' },
  'FIRST50': { discount: 50, type: 'fixed', description: '$50 off first order' },
  'FRIEND10': { discount: 10, type: 'percent', description: '10% friend referral' },
  'AUTHOR25': { discount: 25, type: 'percent', description: '25% author discount' },
  'BETA95': { discount: 95, type: 'percent', description: '95% beta tester discount' },
  'TESTDRIVE': { discount: 95, type: 'percent', description: '95% test discount' },
}

function validateVoucher(code: string, subtotal: number): { valid: boolean; discountAmount: number; error?: string } {
  const upperCode = code.toUpperCase().trim()
  const voucher = VOUCHER_CODES[upperCode]
  
  if (!voucher) {
    return { valid: false, discountAmount: 0, error: 'Invalid voucher code' }
  }
  
  // Check expiry if set
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    return { valid: false, discountAmount: 0, error: 'Voucher has expired' }
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
      selectedUpsells,
      totalAmount,
      voucherCode,
    } = body
    
    // Calculate discount if voucher provided
    let finalAmount = parseFloat(totalAmount)
    let appliedVoucher = null
    
    if (voucherCode) {
      const voucherResult = validateVoucher(voucherCode, finalAmount)
      if (voucherResult.valid) {
        finalAmount = finalAmount - voucherResult.discountAmount
        appliedVoucher = voucherCode.toUpperCase()
      }
    }
    
    // Ensure minimum charge of $1
    finalAmount = Math.max(finalAmount, 1)

    // Create line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Book Translation: ${bookTitle}`,
            description: `${wordCount.toLocaleString()} words (${tier}) → ${selectedLanguages.join(', ').toUpperCase()} • ${fileFormat.toUpperCase()} format preserved${appliedVoucher ? ` • Voucher: ${appliedVoucher}` : ''}`,
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
        tier,
        fileFormat,
        selectedLanguages: JSON.stringify(selectedLanguages),
        selectedGenre,
        selectedUpsells: JSON.stringify(selectedUpsells),
        originalAmount: totalAmount,
        voucherCode: appliedVoucher || '',
        finalAmount: finalAmount.toString(),
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

import { NextRequest, NextResponse } from 'next/server'

// Voucher codes - must match checkout/route.ts
const VOUCHER_CODES: Record<string, { discount: number; type: 'percent' | 'fixed'; description: string; expiresAt?: string; maxUses?: number }> = {
  'LOVEWITHOUTBORDERS': { discount: 15, type: 'percent', description: '15% off International Translation Day offer', expiresAt: '2026-10-01T00:00:00Z' },
  'LAUNCH20': { discount: 20, type: 'percent', description: '20% off launch discount' },
  'FIRST50': { discount: 50, type: 'fixed', description: '$50 off first order' },
  'FRIEND10': { discount: 10, type: 'percent', description: '10% friend referral' },
  'AUTHOR25': { discount: 25, type: 'percent', description: '25% author discount' },
  'BETA95': { discount: 95, type: 'percent', description: '95% beta tester discount' },
  'TESTDRIVE': { discount: 95, type: 'percent', description: '95% test discount' },
  'X7KQ9M2P': { discount: 100, type: 'percent', description: '100% internal test discount' },
  'GIFT3M8XK7QP': { discount: 100, type: 'percent', description: 'Complimentary translation', maxUses: 1 },
  'GIFT9V2RL6WN': { discount: 100, type: 'percent', description: 'Complimentary translation', maxUses: 1 },
}

export async function POST(request: NextRequest) {
  try {
    const { code, subtotal } = await request.json()
    
    const upperCode = code.toUpperCase().trim()
    const voucher = VOUCHER_CODES[upperCode]
    
    if (!voucher) {
      return NextResponse.json({ valid: false, error: 'Invalid voucher code' })
    }

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Voucher has expired' })
    }

    if (voucher.maxUses) {
      const { getSupabaseAdmin } = await import('@/lib/supabase')
      const { count, error } = await getSupabaseAdmin().from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('voucher_code', upperCode)
      if (error) throw error
      if ((count || 0) >= voucher.maxUses) {
        return NextResponse.json({ valid: false, error: 'This voucher has already been used' })
      }
    }
    
    // Calculate discount
    let discountAmount = 0
    if (voucher.type === 'percent') {
      discountAmount = subtotal * (voucher.discount / 100)
    } else {
      discountAmount = Math.min(voucher.discount, subtotal)
    }
    
    return NextResponse.json({
      valid: true,
      code: upperCode,
      discount: voucher.discount,
      type: voucher.type,
      description: voucher.description,
      discountAmount: discountAmount.toFixed(2),
      newTotal: Math.max(subtotal - discountAmount, 1).toFixed(2),
    })
  } catch (error) {
    return NextResponse.json({ valid: false, error: 'Failed to validate voucher' }, { status: 500 })
  }
}

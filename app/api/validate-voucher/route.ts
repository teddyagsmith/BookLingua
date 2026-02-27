import { NextRequest, NextResponse } from 'next/server'

// Voucher codes - must match checkout/route.ts
const VOUCHER_CODES: Record<string, { discount: number; type: 'percent' | 'fixed'; description: string }> = {
  'LAUNCH20': { discount: 20, type: 'percent', description: '20% off launch discount' },
  'FIRST50': { discount: 50, type: 'fixed', description: '$50 off first order' },
  'FRIEND10': { discount: 10, type: 'percent', description: '10% friend referral' },
  'AUTHOR25': { discount: 25, type: 'percent', description: '25% author discount' },
  'BETA95': { discount: 95, type: 'percent', description: '95% beta tester discount' },
  'TESTDRIVE': { discount: 95, type: 'percent', description: '95% test discount' },
}

export async function POST(request: NextRequest) {
  try {
    const { code, subtotal } = await request.json()
    
    const upperCode = code.toUpperCase().trim()
    const voucher = VOUCHER_CODES[upperCode]
    
    if (!voucher) {
      return NextResponse.json({ valid: false, error: 'Invalid voucher code' })
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

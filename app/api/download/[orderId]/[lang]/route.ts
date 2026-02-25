import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string; lang: string } }
) {
  const { orderId, lang } = params

  try {
    // Verify order exists and is completed
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'completed') {
      return NextResponse.json({ error: 'Translation not yet complete' }, { status: 400 })
    }

    // Get the translated file
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('content, original_content')
      .eq('order_id', orderId)
      .eq('language', lang)
      .eq('type', 'translated')
      .single()

    if (fileError || !file) {
      return NextResponse.json({ error: 'Translation not found' }, { status: 404 })
    }

    // Convert highlights to actual yellow highlighting for DOCX
    // For now, return as plain text with highlight markers
    const content = file.content

    // Create response with file download
    const langNames: Record<string, string> = {
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
    }

    const fileName = `${order.book_title}_${langNames[lang] || lang}.txt`

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })

  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}

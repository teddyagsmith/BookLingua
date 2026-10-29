import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { translateBook } from '@/lib/translate-job'

// A full-book semantic pass can legitimately exceed five minutes even though each
// model batch is cached independently. This project uses Vercel Fluid Compute, whose
// Pro ceiling is 800 seconds; keep the route at that ceiling so Inngest does not kill
// healthy large-book work and exhaust its retries while the cache is filling.
export const maxDuration = 800

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [translateBook],
})

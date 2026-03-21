import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { translateBook } from '@/lib/translate-job'

// Allow up to 300s (Vercel Pro max) so Claude API calls on large books don't timeout
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [translateBook],
})

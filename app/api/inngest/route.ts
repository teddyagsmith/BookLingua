import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { translateBook } from '@/lib/translate-job'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [translateBook],
})

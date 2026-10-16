import type { Metadata } from 'next'
import { scorecardEmailHtml } from '@/lib/emails/scorecard'

export const metadata: Metadata = {
  title: 'Scorecard email preview | BookLingua',
  robots: { index: false, follow: false },
}

export default function ScorecardEmailPreview() {
  return <div dangerouslySetInnerHTML={{ __html: scorecardEmailHtml('Clare', true) }} />
}

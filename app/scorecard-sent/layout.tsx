import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Your BookLingua Scorecard Is on Its Way',
  robots: { index: false, follow: false },
}

export default function ScorecardSentLayout({ children }: { children: React.ReactNode }) {
  return children
}

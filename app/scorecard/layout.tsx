import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Free Book Translation Market-Match Scorecard | BookLingua',
  description: 'Compare German, Spanish, French, Italian and Portuguese and find a promising first translation market for your book.',
  alternates: { canonical: '/scorecard' },
  robots: { index: false, follow: true },
}

export default function ScorecardLayout({ children }: { children: React.ReactNode }) {
  return children
}


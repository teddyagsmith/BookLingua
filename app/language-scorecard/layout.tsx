import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Which Language Should You Translate Your Book Into? | Free Scorecard',
  description: 'Use the free BookLingua market-match scorecard to compare German, Spanish, French, Italian and Portuguese for your book.',
  alternates: { canonical: '/language-scorecard' },
}

export default function LanguageScorecardLayout({ children }: { children: React.ReactNode }) {
  return children
}

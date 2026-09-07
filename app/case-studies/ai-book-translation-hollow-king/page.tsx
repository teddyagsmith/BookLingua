import type { Metadata } from 'next'
import CaseStudyMockup from './CaseStudyMockup'

export const metadata: Metadata = {
  title: 'Bride of the Hollow King Translation Case Study | BookLingua',
  description: 'See how BookLingua translated a complete 38,000-word romantasy novel into French and German, with native-language reviewer findings.',
}

export default function HollowKingCaseStudyPage() {
  return <CaseStudyMockup />
}

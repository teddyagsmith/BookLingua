import type { Metadata } from 'next'
import CaseStudyMockup from './CaseStudyMockup'

export const metadata: Metadata = {
  title: 'AI Book Translation Case Study: French and German | BookLingua',
  description: 'See how BookLingua translated a complete 38,000-word romantasy novel into French and German, with native-language reviewer findings.',
  alternates: { canonical: '/case-studies/ai-book-translation-hollow-king' },
}

export default function HollowKingCaseStudyPage() {
  const url = 'https://booklingua.io/case-studies/ai-book-translation-hollow-king'
  const faqs = [
    ['Can AI translate a whole book?', 'Yes. AI can translate a complete manuscript, but a book-length project needs consistent terminology, genre-aware instructions and a separate editorial review. Raw machine output should not be treated as a publication-ready novel.'],
    ['How accurate is AI book translation?', 'It can be highly accurate for meaning and plot, but literary quality also depends on voice, rhythm, dialogue and cultural context. In this case, both native-language reviewers scored the translations 4/5 overall and said they would keep reading.'],
    ['Does an AI-translated novel still need human review?', 'Yes. Professional native-language review helps identify literal phrasing and stylistic issues that an automated process may miss. BookLingua used the reviewers’ feedback to correct the final French and German manuscripts.'],
    ['How much does it cost to translate a 38,000-word book?', 'BookLingua’s current small-book tier covers manuscripts up to 40,000 words from $99 per language. The exact total depends on the number of languages and any optional extras.'],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        additionalType: 'https://schema.org/CaseStudy',
        headline: 'AI Book Translation Case Study: A Romantasy Novel in French and German',
        description: metadata.description,
        url,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'BookLingua' },
        publisher: { '@type': 'Organization', name: 'BookLingua', url: 'https://booklingua.io' },
        about: ['AI book translation', 'literary translation', 'romantasy translation'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(([name, text]) => ({
          '@type': 'Question',
          name,
          acceptedAnswer: { '@type': 'Answer', text },
        })),
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CaseStudyMockup />
    </>
  )
}

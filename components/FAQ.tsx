'use client'

import { useState } from 'react'

const faqs = [
  {
    question: "What file formats do you accept?",
    answer: "We accept EPUB, PDF, DOCX, and TXT files. Your original formatting is preserved in the translation — chapter breaks, italics, bold text, and layout all stay intact."
  },
  {
    question: "How long does translation take?",
    answer: "Most translations complete within 30 minutes to 2 hours. In rare cases during high demand, it may take up to 24 hours. You'll receive an email as soon as your translations are ready to download."
  },
  {
    question: "What languages do you translate to?",
    answer: "We currently translate to Spanish (Latin American), French, German, and Portuguese (Brazilian). Each translation is optimized for the largest reader markets in those languages."
  },
  {
    question: "How does the two-pass system work?",
    answer: "First, your book is translated while preserving your writing style and voice. Then, a premium editorial review polishes every sentence for natural flow and cultural accuracy. All editorial changes are highlighted in yellow so you can review exactly what was improved."
  },
  {
    question: "Can you translate text inside images?",
    answer: "Unfortunately, text embedded in images (like infographics, diagrams, or screenshots) cannot be translated. Only the editable text in your document is translated. If you need images translated, please contact us for a custom quote."
  },
  {
    question: "What is the Launch Strategy Pack?",
    answer: "The Launch Strategy Pack ($29 for one language, $49 for all) gives you everything you need to successfully publish and market your translated book on Amazon: 7 backend keywords optimized for each market, 25+ ad targeting keywords, category recommendations, a review strategy guide, and a complete KDP upload checklist."
  },
  {
    question: "How do I get my translated files?",
    answer: "Once your translation is complete, you'll receive an email with secure download links. Links are valid for 7 days. If you need them resent, just reply to any of our emails or contact support."
  },
  {
    question: "Do you offer refunds?",
    answer: "If your translation hasn't started processing yet, we offer a full refund. Once translation has begun, we're happy to work with you to address any quality concerns. Contact us at support@booklingua.com."
  },
  {
    question: "Can I provide special instructions?",
    answer: "Yes! During checkout, there's a field for special instructions. You can note things like 'keep medical terms in Latin,' 'use formal Spanish,' or 'this is British English.' Our system takes your instructions into account during translation."
  },
  {
    question: "What about copyright and confidentiality?",
    answer: "Your content remains 100% yours. We never share, publish, or use your book content for any purpose other than providing your translation. Your files are securely stored and automatically deleted 30 days after delivery."
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  
  const serifFont = { fontFamily: "'Instrument Serif', Georgia, serif" }

  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4" style={serifFont}>
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to know about BookLingua
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-2xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900">{faq.question}</span>
                <span className={`text-2xl text-violet-600 transition-transform ${openIndex === index ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5">
                  <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">Still have questions?</p>
          <a
            href="mailto:support@booklingua.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
          >
            Contact Support →
          </a>
        </div>
      </div>
    </section>
  )
}

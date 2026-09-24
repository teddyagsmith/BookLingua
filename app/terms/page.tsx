import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service | BookLingua',
  description: 'Terms governing BookLingua translation orders, deliverables, review scope, revisions and refunds.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" introduction="These terms govern your use of BookLingua, a service operated by Hykke Ltd, and any translation, review or launch materials you order from us.">
      <LegalSection title="Eligibility and acceptance">
        <p>By placing an order, you confirm that you are legally able to enter into a contract and agree to these terms. If you order for an organisation or another rights holder, you confirm that you have authority to bind them.</p>
      </LegalSection>
      <LegalSection title="Your manuscript and rights">
        <p>You retain ownership of your manuscript. You confirm that you own or control the rights needed for BookLingua to translate and process it, and that the content and our processing of it do not infringe another person’s rights or violate applicable law.</p>
        <p>You grant BookLingua and its service providers a limited, non-exclusive permission to host, copy, process, translate and review the manuscript solely to provide the ordered service, maintain security and resolve support issues.</p>
      </LegalSection>
      <LegalSection title="What the service includes">
        <p>Your deliverables depend on the options shown at checkout. A standard order uses AI-assisted translation, a separate AI editorial-review pass, terminology and consistency checks, and targeted review of selected passages by a professional translator. Targeted review is not a full-manuscript human translation, edit or proofread.</p>
        <p>Optional launch materials are recommendations, not guarantees of ranking, sales, advertising performance or acceptance by Amazon or another distributor.</p>
      </LegalSection>
      <LegalSection title="Your review responsibility">
        <p>Language and publishing decisions can be subjective. You are responsible for reviewing the delivered files, names, specialist terminology, formatting, metadata and cultural choices before publication. BookLingua does not guarantee that a translation will be error-free or suitable for every legal, medical, technical or regulated purpose.</p>
      </LegalSection>
      <LegalSection title="Turnaround and delivery">
        <p>Turnaround estimates are not guaranteed deadlines. Complex formatting, unusually long works, provider interruptions or quality checks can require additional time. Delivery is made through the email address and secure download links associated with the order. You are responsible for providing a working email address and downloading your files promptly.</p>
      </LegalSection>
      <LegalSection title="Corrections and revisions">
        <p>If you identify a material translation or processing issue, contact <a className="font-semibold text-brand-dark underline" href="mailto:support@booklingua.io">support@booklingua.io</a> promptly with the order number and specific examples. We will assess reasonable correction requests related to the agreed scope. Rewriting based on a new creative direction, changes to the source manuscript, full human editing, reformatting outside the stated deliverables or additional languages are not included unless agreed separately.</p>
      </LegalSection>
      <LegalSection title="Prices, payment and refunds">
        <LegalList>
          <li>Prices and included features are those shown at checkout when you order.</li>
          <li>Payments are processed by Stripe.</li>
          <li>If processing has not started, you may request a full refund.</li>
          <li>Once processing has begun, fees are generally non-refundable because computing, review and production costs have been incurred. We will first work with you to address substantiated quality issues within the agreed scope.</li>
          <li>Nothing in these terms removes any mandatory consumer right that applies to you.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <p>You must not upload unlawful content, malware, content you have no right to process, or material intended to abuse or disrupt the service. We may refuse or stop an order where reasonably necessary for safety, legal compliance or provider-policy compliance, and will determine any refund according to work already performed and applicable law.</p>
      </LegalSection>
      <LegalSection title="Liability and availability">
        <p>BookLingua is provided with reasonable care and skill. To the extent permitted by law, we are not responsible for indirect losses, lost sales, lost profits, publishing-platform decisions or consequences of publishing files without your own final review. Our total liability relating to an order will not exceed the amount paid for that order, except where liability cannot lawfully be limited.</p>
      </LegalSection>
      <LegalSection title="Changes and contact">
        <p>We may update these terms for future use of the service. The terms in force when you order will govern that order. Questions can be sent to <a className="font-semibold text-brand-dark underline" href="mailto:hello@booklingua.io">hello@booklingua.io</a> or Hykke Ltd, 123 Hallgate, Cottingham, East Riding of Yorkshire, HU16 4DA, United Kingdom.</p>
      </LegalSection>
    </LegalPage>
  )
}

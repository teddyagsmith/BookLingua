import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'How We Protect Your Manuscript | BookLingua',
  description: 'How BookLingua stores, processes, reviews and deletes uploaded manuscripts, including the AI and service providers involved.',
  alternates: { canonical: '/manuscript-security' },
}

export default function ManuscriptSecurityPage() {
  return (
    <LegalPage eyebrow="Trust & security" title="How We Protect Your Manuscript" introduction="Your manuscript is valuable creative work. This page explains who can access it, where it is processed and the safeguards BookLingua uses throughout an order.">
      <LegalSection title="Your work remains yours">
        <p>You retain all rights in your manuscript. Uploading it gives BookLingua only the limited permission needed to process the file, create the services you ordered and provide support. We do not publish, sell or license your manuscript.</p>
      </LegalSection>
      <LegalSection title="Who can access an upload">
        <p>Access is limited to people and providers who need it to deliver or support your order:</p>
        <LegalList>
          <li>authorised BookLingua personnel handling processing, quality assurance or customer support;</li>
          <li>Anthropic, whose API processes manuscript text for translation, editorial review, consistency work and related order outputs;</li>
          <li>professional language reviewers, who receive selected passages requiring particular care rather than the full manuscript unless a broader review has been separately agreed; and</li>
          <li>infrastructure providers that host, transmit or secure the service, including Supabase and Vercel.</li>
        </LegalList>
        <p>We do not give other customers access to your files.</p>
      </LegalSection>
      <LegalSection title="Storage and transfer safeguards">
        <LegalList>
          <li>Uploads and generated files are stored in private Supabase storage buckets.</li>
          <li>Database records are protected by row-level access controls and server-side service credentials.</li>
          <li>Uploads use time-limited signed upload URLs.</li>
          <li>Customer downloads use order-specific, signed links rather than public storage URLs.</li>
          <li>Data is encrypted in transit using HTTPS.</li>
        </LegalList>
        <p>No internet service can promise absolute security. If we become aware of a security incident affecting your personal data, we will respond in accordance with applicable law.</p>
      </LegalSection>
      <LegalSection title="AI processing and model training">
        <p>BookLingua currently uses Anthropic’s commercial API. BookLingua does not use manuscripts to train its own models and does not opt manuscript content into provider model training. Anthropic states that commercial API inputs and outputs are not used to train its models by default unless a customer chooses to opt in.</p>
        <p>Anthropic may retain API data for a limited period for safety and abuse monitoring under its commercial terms. Its own privacy and data-retention terms apply to that processing.</p>
      </LegalSection>
      <LegalSection title="How long files are kept">
        <p>Unfinished upload sessions are temporary and are removed when they are no longer needed for checkout recovery and service security. For paid orders, source files, working files and deliverables are retained only as long as reasonably needed to complete the order, make downloads available, resolve support or quality issues and maintain necessary business records.</p>
        <p>BookLingua does not currently promise a fixed automatic deletion date for completed-order files. You can request deletion of manuscript files after delivery by emailing <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a>. We will remove them from active systems unless retention is required to resolve a dispute, prevent fraud or comply with law. Limited encrypted backups may persist until they cycle out under provider schedules.</p>
      </LegalSection>
      <LegalSection title="Questions or deletion requests">
        <p>Email <a className="font-semibold text-brand-dark underline" href="mailto:privacy@booklingua.io">privacy@booklingua.io</a> with your order email or order number. We may need to verify your identity before acting on a request.</p>
      </LegalSection>
    </LegalPage>
  )
}

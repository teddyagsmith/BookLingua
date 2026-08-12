import { PackageManifestV1, evaluatePackageManifest } from './package-manifest'

export const EMAIL_TEMPLATE_VERSION = '1.0'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
}

export function renderReviewEmail(input: {
  bookTitle: string
  adminUrl: string
  manifest: PackageManifestV1
}): { subject: string; html: string } {
  const manifest = evaluatePackageManifest(input.manifest)
  const passed = manifest.status === 'pass'
  const artifacts = manifest.artifacts.map(artifact => `<li>${escapeHtml(artifact.type)} — ${escapeHtml(artifact.validationStatus)}</li>`).join('')
  const errors = manifest.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')
  return {
    subject: `${passed ? 'PASS' : 'FAIL'} — ${input.bookTitle} — ${manifest.language}`,
    html: `<div data-template-version="${EMAIL_TEMPLATE_VERSION}"><h1>${passed ? 'PASS' : 'FAIL'}</h1><p>${escapeHtml(input.bookTitle)} — ${escapeHtml(manifest.language)}</p>${passed ? `<h2>Validated artifacts</h2><ul>${artifacts}</ul><p><a href="${escapeHtml(input.adminUrl)}">Review in admin</a></p>` : `<h2>Blocking reasons</h2><ul>${errors}</ul><p>No publication-ready claim or customer delivery is permitted.</p>`}</div>`,
  }
}

export function renderCustomerDeliveryEmail(input: {
  authorName: string
  bookTitle: string
  manifest: PackageManifestV1
  artifactUrls: Partial<Record<string, string>>
}): { subject: string; html: string } {
  const manifest = evaluatePackageManifest(input.manifest)
  if (manifest.status !== 'pass') throw new Error('Cannot render customer delivery email for a failed package')
  const links = manifest.artifacts
    .filter(artifact => artifact.required)
    .map(artifact => {
      const url = input.artifactUrls[artifact.type]
      if (!url) throw new Error(`Missing delivery URL for ${artifact.type}`)
      return `<li><a href="${escapeHtml(url)}">${escapeHtml(artifact.filename)}</a></li>`
    }).join('')
  return {
    subject: `Your BookLingua publication package: ${input.bookTitle}`,
    html: `<div data-template-version="${EMAIL_TEMPLATE_VERSION}"><h1>Your translated book is ready</h1><p>Hi ${escapeHtml(input.authorName)},</p><p>Your validated ${escapeHtml(manifest.language)} package for <strong>${escapeHtml(input.bookTitle)}</strong> is ready.</p><ul>${links}</ul></div>`,
  }
}

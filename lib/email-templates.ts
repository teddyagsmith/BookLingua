import { PackageManifestV1, evaluatePackageManifest } from './package-manifest'

export const EMAIL_TEMPLATE_VERSION = '1.0'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
}

export function renderAggregateReviewEmail(input: {
  bookTitle: string
  adminUrl: string
  manifests: PackageManifestV1[]
  artifactUrls: Record<string, Record<string, string>>
}): { subject: string; html: string; templateVersion: string } {
  const evaluated = input.manifests.map(evaluatePackageManifest)
  const passed = evaluated.length > 0 && evaluated.every(manifest => manifest.status === 'pass')
  const sections = evaluated.map(manifest => {
    const artifacts = manifest.artifacts.map(artifact => {
      const url = input.artifactUrls[manifest.language]?.[artifact.type]
      const label = `${artifact.type} — ${artifact.validationStatus} — sha256 ${artifact.sha256}`
      return `<li>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>` : escapeHtml(label)}</li>`
    }).join('')
    const errors = manifest.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')
    return `<section><h2>${escapeHtml(manifest.language)} — ${manifest.status.toUpperCase()}</h2>${manifest.status === 'pass' ? `<h3>Validated artifacts</h3><ul>${artifacts}</ul><p>Validation summary: every entitled artifact is present and authoritatively PASS.</p>` : `<h3>Blocking reasons</h3><ul>${errors}</ul>`}</section>`
  }).join('')
  return {
    subject: `${passed ? 'PASS' : 'FAIL'} — INTERNAL REVIEW — ${input.bookTitle} — ${evaluated.map(item => item.language).join(', ')}`,
    html: `<div data-template-version="${EMAIL_TEMPLATE_VERSION}"><h1>${passed ? 'PASS' : 'FAIL'} — Internal review</h1><p>Customer delivery is not authorized by this email.</p>${sections}<p><a href="${escapeHtml(input.adminUrl)}">Review in admin</a></p></div>`,
    templateVersion: EMAIL_TEMPLATE_VERSION,
  }
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

export function renderCustomerPackageEmail(input:{authorName:string;bookTitle:string;languages:string[];downloadPageUrl:string}):{subject:string;html:string;text:string;templateVersion:string}{
  if(!input.languages.length)throw new Error('Customer delivery email requires at least one language')
  const naturalList=(values:string[])=>values.length===1?values[0]:values.length===2?`${values[0]} and ${values[1]}`:`${values.slice(0,-1).join(', ')}, and ${values.at(-1)}`
  const languages=escapeHtml(naturalList(input.languages))
  const subject=`Your BookLingua translations are ready: ${input.bookTitle}`
  const text=`Hi ${input.authorName},\n\nYour ${naturalList(input.languages)} translations of ${input.bookTitle} are ready.\n\nView & download your files: ${input.downloadPageUrl}\n\nStart with How to Use Your Translations + Upload Guide. The Final files are the clean versions for editing and upload, the Review file shows BookLingua’s review changes, and Chapters matches the original and translated structure.\n\nHappy publishing,\nThe BookLingua Team`
  return{subject,text,templateVersion:'customer-delivery-v4',html:`<div data-template-version="customer-delivery-v4" style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;line-height:1.6"><div style="padding:24px 0;border-bottom:3px solid #7c3aed"><h1 style="margin:0;color:#5b21b6;font-size:28px">Your translations are ready</h1></div><p>Hi ${escapeHtml(input.authorName||'there')},</p><p>Your <strong>${languages}</strong> translations of <strong>${escapeHtml(input.bookTitle)}</strong> are ready.</p><p style="text-align:center;margin:32px 0"><a href="${escapeHtml(input.downloadPageUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:8px">View &amp; download your files</a></p><p>The <strong>Final</strong> files are the clean versions for editing and upload. Use the <strong>Review</strong> file to inspect BookLingua’s changes, and <strong>Chapters</strong> to match the translated chapters to your original manuscript.</p><p>Start with <strong>How to Use Your Translations + Upload Guide</strong> for a clear explanation of every file and the next steps.</p><p>Happy publishing,<br>The BookLingua Team</p></div>`}
}

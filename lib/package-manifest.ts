export const PACKAGE_MANIFEST_SCHEMA_VERSION = '1.0'

export type PackageStatus = 'building' | 'pass' | 'fail'
export type ArtifactType =
  | 'translation_brief'
  | 'pass1_docx'
  | 'review_docx'
  | 'final_epub'
  | 'final_docx'
  | 'translation_notes'
  | 'chapter_map_docx'
  | 'chapter_map_csv'
  | 'upload_guide'
  | 'launch_pack'

export interface PackageArtifact {
  type: ArtifactType
  required: boolean
  filename: string
  storageBucket: string
  storagePath: string
  sha256: string
  sizeBytes: number
  schemaVersion?: string
  validationStatus: 'pending' | 'pass' | 'fail'
  validationReportId?: string
}

export interface PackageEntitlements {
  sourceFormat: 'epub' | 'docx' | 'txt'
  launchPack: boolean
  dualFormat: boolean
}

export interface PackageManifestV1 {
  schemaVersion: typeof PACKAGE_MANIFEST_SCHEMA_VERSION
  orderId: string
  language: string
  status: PackageStatus
  entitlements: PackageEntitlements
  artifacts: PackageArtifact[]
  errors: string[]
  generatedAt: string
}

export function requiredArtifactTypes(entitlements: PackageEntitlements): ArtifactType[] {
  const required: ArtifactType[] = [
    'translation_brief', 'pass1_docx', 'review_docx', 'translation_notes',
    'chapter_map_docx', 'chapter_map_csv', 'upload_guide',
  ]
  if (entitlements.sourceFormat === 'epub' || entitlements.dualFormat) required.push('final_epub')
  if (entitlements.sourceFormat === 'docx' || entitlements.sourceFormat === 'txt' || entitlements.dualFormat) required.push('final_docx')
  if (entitlements.launchPack) required.push('launch_pack')
  return required
}

export function evaluatePackageManifest(manifest: PackageManifestV1): PackageManifestV1 {
  const required = requiredArtifactTypes(manifest.entitlements)
  const errors: string[] = []
  for (const type of required) {
    const artifact = manifest.artifacts.find(item => item.type === type)
    if (!artifact) errors.push(`Missing required artifact: ${type}`)
    else if (artifact.validationStatus !== 'pass') errors.push(`Required artifact did not pass validation: ${type}`)
    else if (!artifact.storagePath || !artifact.sha256 || artifact.sizeBytes <= 0) errors.push(`Required artifact metadata incomplete: ${type}`)
  }
  return { ...manifest, status: errors.length ? 'fail' : 'pass', errors }
}

export function canDeliverPackage(manifest: PackageManifestV1): boolean {
  return evaluatePackageManifest(manifest).status === 'pass'
}

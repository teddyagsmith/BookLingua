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
  id: string
  buildId: string
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
  buildId: string
  status: PackageStatus
  entitlements: PackageEntitlements
  artifacts: PackageArtifact[]
  errors: string[]
  generatedAt: string
}

export function authoritativeValidationPassed(relation: unknown): boolean {
  if (Array.isArray(relation)) return relation.length === 1 && relation[0]?.passed === true
  return Boolean(relation && typeof relation === 'object' && (relation as { passed?: unknown }).passed === true)
}

export async function assemblePackageManifest(input: {
  supabase: any
  orderId: string
  language: string
  buildId: string
}): Promise<PackageManifestV1> {
  const { data: order, error: orderError } = await input.supabase.from('orders')
    .select('file_format, upsells').eq('id', input.orderId).single()
  if (orderError || !order) throw new Error('Unable to load package entitlements')
  const { data: rows, error } = await input.supabase.from('artifacts')
    .select('id, order_id, language, build_id, artifact_type, storage_bucket, storage_path, filename, sha256, size_bytes, schema_version, validation_status, validation_report_id, validation_reports(passed)')
    .eq('order_id', input.orderId).eq('language', input.language).eq('build_id', input.buildId)
  if (error) throw new Error(`Unable to load authoritative artifacts: ${error.message}`)
  const artifacts: PackageArtifact[] = (rows || []).map((row: any) => ({
    id: row.id, buildId: row.build_id, type: row.artifact_type, required: true,
    filename: row.filename, storageBucket: row.storage_bucket, storagePath: row.storage_path,
    sha256: row.sha256, sizeBytes: Number(row.size_bytes), schemaVersion: row.schema_version || undefined,
    validationStatus: row.validation_status === 'pass' && authoritativeValidationPassed(row.validation_reports) ? 'pass' : 'fail',
    validationReportId: row.validation_report_id || undefined,
  }))
  const upsells = Array.isArray(order.upsells) ? order.upsells : JSON.parse(order.upsells || '[]')
  const sourceFormat = String(order.file_format || 'docx').replace(/^\./, '') as PackageEntitlements['sourceFormat']
  return {
    schemaVersion: PACKAGE_MANIFEST_SCHEMA_VERSION, orderId: input.orderId, language: input.language,
    buildId: input.buildId, status: 'building', artifacts, errors: [], generatedAt: new Date().toISOString(),
    entitlements: { sourceFormat, launchPack: upsells.includes('launch-pack'), dualFormat: upsells.includes('dual-format') },
  }
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
    const matches = manifest.artifacts.filter(item => item.type === type && item.buildId === manifest.buildId)
    const artifact = matches[0]
    if (matches.length !== 1) errors.push(`Expected exactly one required artifact: ${type}`)
    if (!artifact) errors.push(`Missing required artifact: ${type}`)
    else if (artifact.validationStatus !== 'pass') errors.push(`Required artifact did not pass validation: ${type}`)
    else if (!artifact.id || !artifact.storagePath || !artifact.sha256 || artifact.sizeBytes <= 0) errors.push(`Required artifact metadata incomplete: ${type}`)
  }
  return { ...manifest, status: errors.length ? 'fail' : 'pass', errors }
}

export function canDeliverPackage(manifest: PackageManifestV1): boolean {
  return evaluatePackageManifest(manifest).status === 'pass'
}

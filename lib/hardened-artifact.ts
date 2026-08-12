import { createHash } from 'crypto'
import { ArtifactType, PackageArtifact, PackageManifestV1 } from './package-manifest'
import { ARTIFACT_BUCKET } from './artifact-store'

export interface PersistedArtifactRecord {
  id: string
  order_id: string
  language: string
  build_id: string
  artifact_type: string
  storage_bucket: string
  storage_path: string
  filename: string
  sha256: string
  size_bytes: number | string
  validation_status: string
  validation_reports?: unknown
}

export function selectManifestArtifact(manifest: PackageManifestV1, type: ArtifactType): PackageArtifact {
  if (manifest.status !== 'pass') throw new Error('Package manifest is not passed')
  const matches = manifest.artifacts.filter(item => item.type === type && item.buildId === manifest.buildId)
  if (matches.length !== 1) throw new Error('Package manifest artifact identity is ambiguous')
  return matches[0]
}

function reportPassed(relation: unknown): boolean {
  if (Array.isArray(relation)) return relation.length === 1 && relation[0]?.passed === true
  return Boolean(relation && typeof relation === 'object' && (relation as { passed?: unknown }).passed === true)
}

export function verifyStoredArtifact(input: {
  manifestArtifact: PackageArtifact
  record: PersistedArtifactRecord
  orderId: string
  language: string
  buildId: string
  type: ArtifactType
  bytes: Buffer
}): void {
  const { manifestArtifact, record } = input
  if (record.id !== manifestArtifact.id || record.order_id !== input.orderId || record.language !== input.language || record.build_id !== input.buildId || record.artifact_type !== input.type) throw new Error('Artifact ownership mismatch')
  if (record.storage_bucket !== ARTIFACT_BUCKET || manifestArtifact.storageBucket !== ARTIFACT_BUCKET || record.storage_path !== manifestArtifact.storagePath) throw new Error('Artifact storage identity mismatch')
  if (record.validation_status !== 'pass' || !reportPassed(record.validation_reports) || manifestArtifact.validationStatus !== 'pass') throw new Error('Artifact validation is not authoritative')
  if (record.sha256 !== manifestArtifact.sha256 || Number(record.size_bytes) !== manifestArtifact.sizeBytes) throw new Error('Artifact metadata differs from passed manifest')
  if (input.bytes.length !== Number(record.size_bytes) || createHash('sha256').update(input.bytes).digest('hex') !== record.sha256) throw new Error('Stored artifact integrity check failed')
}

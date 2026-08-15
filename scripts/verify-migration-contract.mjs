import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationDir = path.join(root, 'supabase', 'migrations')
const files = fs.readdirSync(migrationDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
const versions = new Map()
for (const file of files) {
  const version = file.match(/^(\d+)_/)[1]
  if (versions.has(version)) throw new Error(`Duplicate active migration version ${version}: ${versions.get(version)}, ${file}`)
  versions.set(version, file)
}
const required = [
  '202608120000_hosted_prerequisites.sql',
  '202608120001_pipeline_hardening_source.sql',
  '202608120002_pipeline_hardening_state.sql',
  '202608120003_pipeline_hardening_briefs.sql',
  '202608120004_pipeline_hardening_cache.sql',
  '202608120005_semantic_pipeline.sql',
  '202608130001_full_book_batching_observability.sql',
  '202608150001_customer_package_v1_cutover.sql',
]
for (const file of required) if (!files.includes(file)) throw new Error(`Missing WB1 migration ${file}`)
for (const historical of ['002_feedback_glossaries_preferences.sql','20250416_add_welcome_sequence.sql','20260401_email_subscribers.sql','20260403_temp_uploads_email.sql','20260421_email_subscribers.sql','20260805_temp_uploads_cultural_terms.sql']) {
  if (files.includes(historical)) throw new Error(`Unsafe historical migration remains active: ${historical}`)
}
const manifestPath = path.join(root, 'supabase', 'deployment', 'production_incremental_manifest.txt')
const manifest = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'))
const expectedManifest = [
  'supabase/deployment/production_incremental_preconditions.sql',
  'supabase/migrations/202608120000_hosted_prerequisites.sql',
  'supabase/migrations/202608120001_pipeline_hardening_source.sql',
  'supabase/migrations/202608120002_pipeline_hardening_state.sql',
  'supabase/migrations/202608120003_pipeline_hardening_briefs.sql',
  'supabase/migrations/202608120004_pipeline_hardening_cache.sql',
  'supabase/migrations/202608120005_semantic_pipeline.sql',
  'supabase/deployment/production_incremental_postconditions.sql',
]
if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) throw new Error('Production incremental manifest differs from reviewed order')
for (const entry of manifest) if (!fs.existsSync(path.join(root, entry))) throw new Error(`Manifest entry missing: ${entry}`)
const batchingManifestPath = path.join(root, 'supabase', 'deployment', 'production_batching_incremental_manifest.txt')
const batchingManifest = fs.readFileSync(batchingManifestPath, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'))
const expectedBatchingManifest = [
  'supabase/deployment/production_batching_incremental_preconditions.sql',
  'supabase/migrations/202608130001_full_book_batching_observability.sql',
  'supabase/deployment/production_batching_incremental_postconditions.sql',
]
if (JSON.stringify(batchingManifest) !== JSON.stringify(expectedBatchingManifest)) throw new Error('Batching remediation manifest differs from reviewed order')
for (const entry of batchingManifest) if (!fs.existsSync(path.join(root, entry))) throw new Error(`Batching manifest entry missing: ${entry}`)
const customerPackageManifest = fs.readFileSync(path.join(root, 'supabase', 'deployment', 'production_customer_package_v1_manifest.txt'), 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'))
const expectedCustomerPackageManifest = [
  'supabase/deployment/production_customer_package_v1_preconditions.sql',
  'supabase/migrations/202608150001_customer_package_v1_cutover.sql',
  'supabase/deployment/production_customer_package_v1_postconditions.sql',
]
if (JSON.stringify(customerPackageManifest) !== JSON.stringify(expectedCustomerPackageManifest)) throw new Error('Customer Package V1 manifest differs from reviewed order')
for (const entry of customerPackageManifest) if (!fs.existsSync(path.join(root, entry))) throw new Error(`Customer Package V1 manifest entry missing: ${entry}`)
const baseline = path.join(root, 'supabase', 'bootstrap', '00000000000000_disposable_baseline.sql')
if (!fs.existsSync(baseline)) throw new Error('Missing disposable baseline bootstrap')
const baselineSql = fs.readFileSync(baseline, 'utf8')
for (const table of ['orders', 'files', 'temp_uploads', 'translation_chunks', 'email_subscribers']) {
  if (!new RegExp(`create table ${table}\\b`, 'i').test(baselineSql)) throw new Error(`Bootstrap missing ${table}`)
}
console.log(`Migration contract verified: ${files.length} active versions, unique and ordered; hosted manifest ${manifest.length} exact steps; batching manifest ${batchingManifest.length} exact steps; customer package manifest ${customerPackageManifest.length} exact steps`)

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
  '202608120001_pipeline_hardening_source.sql',
  '202608120002_pipeline_hardening_state.sql',
  '202608120003_pipeline_hardening_briefs.sql',
  '202608120004_pipeline_hardening_cache.sql',
  '202608120005_semantic_pipeline.sql',
]
for (const file of required) if (!files.includes(file)) throw new Error(`Missing WB1 migration ${file}`)
const baseline = path.join(root, 'supabase', 'bootstrap', '00000000000000_disposable_baseline.sql')
if (!fs.existsSync(baseline)) throw new Error('Missing disposable baseline bootstrap')
const baselineSql = fs.readFileSync(baseline, 'utf8')
for (const table of ['orders', 'files', 'temp_uploads', 'translation_chunks', 'email_subscribers']) {
  if (!new RegExp(`create table ${table}\\b`, 'i').test(baselineSql)) throw new Error(`Bootstrap missing ${table}`)
}
console.log(`Migration contract verified: ${files.length} active versions, unique and ordered`)

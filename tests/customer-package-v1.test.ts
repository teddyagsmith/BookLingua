import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CUSTOMER_PACKAGE_VERSION, DEFAULT_NEW_ORDER_PIPELINE, newOrderPipelineFields } from '../lib/customer-package-version'
import { CUSTOMER_ARTIFACT_TYPES } from '../lib/customer-delivery'
import { BRANDED_DOCUMENT_LOGO_ASSET, BRANDED_DOCUMENT_LOGO_WIDTH_MM } from '../lib/branded-document-header'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('Customer Package V1 freezes the accepted artifact and branded-header contract', () => {
  assert.equal(CUSTOMER_PACKAGE_VERSION, 'customer-package-v1')
  assert.equal(DEFAULT_NEW_ORDER_PIPELINE, 'semantic-v2')
  assert.deepEqual(newOrderPipelineFields(), { pipeline_version: 'semantic-v2', customer_package_version: 'customer-package-v1' })
  assert.deepEqual(CUSTOMER_ARTIFACT_TYPES, ['final_docx','final_epub','review_docx','chapter_map_docx','translation_notes','launch_pack'])
  assert.equal(BRANDED_DOCUMENT_LOGO_ASSET, 'public/logo-doc-safe.png')
  assert.ok(BRANDED_DOCUMENT_LOGO_WIDTH_MM >= 55 && BRANDED_DOCUMENT_LOGO_WIDTH_MM <= 65)
  assert.match(read('CUSTOMER_PACKAGE_V1_ACCEPTANCE.md'), /No redesign or content change is permitted/)
})

test('all new-order creation paths explicitly stamp semantic-v2 and Customer Package V1', () => {
  for (const file of ['app/api/webhook/route.ts','app/api/checkout/route.ts']) {
    const source = read(file)
    assert.match(source, /newOrderPipelineFields/)
    assert.match(source, /\.\.\.newOrderPipelineFields\(\)/)
  }
})

test('manual delivery approval is explicit, recipient-bound, language-bound and fail-closed', () => {
  const admin = read('app/admin/page.tsx')
  const approval = read('app/api/admin/orders/[orderId]/approve/route.ts')
  const download = read('app/api/download/[orderId]/[lang]/route.ts')
  assert.match(admin, /Approve & Send to Customer\?/) 
  assert.match(admin, /Approved \/ delivered/)
  assert.match(admin, /Ready for review/)
  assert.match(admin, /Customer: \$\{order\.email\}/)
  assert.match(admin, /Languages: \$\{languages\.join/)
  assert.match(approval, /expectedRecipient/)
  assert.match(approval, /expectedLanguages/)
  assert.match(approval, /begin_hardened_delivery/)
  assert.match(approval, /idempotencyKey: `delivery\//)
  assert.match(download, /customerScope && !\['completed','delivery_pending'\]\.includes\(order\.status\)/)
})

test('admin can inspect only the current fully validated customer package before approval', () => {
  const route = read('app/api/admin/orders/[orderId]/package/route.ts')
  assert.match(route, /order\.status !== 'ready_for_review'/)
  assert.match(route, /is_current', true/)
  assert.match(route, /evaluatePackageManifest\(manifest\)\.status !== 'pass'/)
  assert.match(route, /CUSTOMER_ARTIFACT_TYPES\.includes/)
})

test('cutover migration records the package version without mutating existing orders', () => {
  const migration = read('supabase/migrations/202608150001_customer_package_v1_cutover.sql')
  assert.match(migration, /add column if not exists customer_package_version text/)
  assert.match(migration, /customer-package-v1/)
  assert.match(migration, /pipeline_version = 'semantic-v2'/)
  assert.match(migration, /create table if not exists pipeline_cutovers/)
  assert.doesNotMatch(migration, /update\s+orders/i)
})

test('batching postconditions cannot shadow information_schema table_name', () => {
  const postconditions = read('supabase/deployment/production_batching_incremental_postconditions.sql')
  assert.doesNotMatch(postconditions, /declare\s+table_name\s+text/i)
  assert.match(postconditions, /declare\s+checked_table_name\s+text/i)
  assert.match(postconditions, /information_schema\.columns\s+c[\s\S]*c\.table_name='launch_pack_results'/i)
  assert.match(postconditions, /group by c\.table_schema,c\.table_name having count\(\*\)=5/i)
})

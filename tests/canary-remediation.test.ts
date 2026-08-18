import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { extractLaunchPackText, generateLaunchStrategy, parseLaunchStrategyText, toCanonicalLaunchPack } from '../lib/launch-strategy'
import { finalizeSemanticOrder } from '../lib/semantic-finalization'
import { PackageArtifact, PackageManifestV1, requiredArtifactTypes } from '../lib/package-manifest'
import { cachedLaunchPack, launchPackIdentity, launchPackRequestIdentity } from '../lib/launch-pack-cache'
import { launchMarket } from '../lib/launch-pack-schema'
import { researchFields } from './launch-pack-fixture'

const strategy = {
  backendKeywords: ['one','two','three','four','five','six','seven'],
  adKeywords: Array.from({ length: 20 }, (_, index) => `ad-${index}`),
  categories: ['a','b','c'], pricingRecommendation: { ebook: '€1', paperback: '€2', reasoning: 'market' },
  bookDescription: 'Description', reviewStrategy: ['Review'], kdpUploadChecklist: ['Upload'],...researchFields,
}
const json = JSON.stringify(strategy)

test('Launch Pack selects the first non-empty text block regardless of preceding block types', () => {
  assert.equal(extractLaunchPackText([{ type: 'text', text: json, citations: [] } as any]), json)
  assert.equal(extractLaunchPackText([{ type: 'thinking', thinking: 'x', signature: 'x' } as any, { type: 'text', text: json, citations: [] } as any]), json)
  assert.equal(extractLaunchPackText([{ type: 'thinking' } as any, { type: 'tool_use' } as any, { type: 'text', text: json, citations: [] } as any]), json)
  assert.throws(() => extractLaunchPackText([{ type: 'thinking' } as any]), /no non-empty text block/)
  assert.throws(() => extractLaunchPackText([{ type: 'text', text: '  ' } as any]), /no non-empty text block/)
})

test('Launch Pack generation reserves enough output budget and enforces compact JSON', () => {
  const source=fs.readFileSync(path.join(process.cwd(),'lib/launch-strategy.ts'),'utf8')
  assert.match(source,/max_tokens:\s*32768/)
  assert.match(source,/complete response below 60,000 characters/)
})

test('Launch Pack parsing fails closed for malformed text and unsupported locale', () => {
  assert.throws(() => parseLaunchStrategyText('{bad'), /malformed JSON/)
  assert.throws(() => toCanonicalLaunchPack(strategy, 'xx', true), /Unsupported Launch Pack locale/)
})

test('Launch Pack captures successful and failed attempt metadata', async () => {
  const records: any[] = []
  const output = await generateLaunchStrategy({ bookTitle: 'Synthetic', authorName: 'Author', genre: 'fantasy', bookDescription: 'Synthetic', targetLanguage: 'French', targetMarket: 'France' }, {
    attempt: 2, requestId: 'order:fr:launch-pack', onMetadata: record => { records.push(record) },
    createMessage: async () => ({ model: 'claude-opus-5', usage: { input_tokens: 123, output_tokens: 45 }, content: [{ type: 'thinking' }, { type: 'text', text: json }] } as any),
  })
  assert.deepEqual(output, strategy)
  assert.deepEqual(records[0], { provider: 'anthropic', modelId: 'claude-opus-5', inputTokens: 123, outputTokens: 45, attempt: 2, success: true, stage: 'launch-pack', requestId: 'order:fr:launch-pack' })
  await assert.rejects(() => generateLaunchStrategy({ bookTitle: 'Synthetic', authorName: 'Author', genre: 'fantasy', bookDescription: 'Synthetic', targetLanguage: 'French', targetMarket: 'France' }, {
    attempt: 3, onMetadata: record => { records.push(record) }, createMessage: async () => { throw new Error('provider failed') },
  }), /provider failed/)
  assert.equal(records[1].attempt, 3); assert.equal(records[1].success, false); assert.equal(records[1].modelId, 'claude-opus-5')
})

test('validated Launch Pack is generated once and reused on whole-job retry', async () => {
  const rows:any[]=[]
  const db:any={from(){let filters:any={};const chain:any={select:()=>chain,eq:(k:string,v:any)=>{filters[k]=v;return chain},maybeSingle:async()=>({data:rows.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v))||null,error:null}),insert:async(row:any)=>{rows.push(row);return{error:null}}};return chain}}
  let calls=0
  const generate=async()=>{calls++;const market=launchMarket('fr');return {schemaVersion:'3.0',...market,backendKeywords:['1','2','3','4','5','6','7'],adKeywords:Array.from({length:20},(_,i)=>`a${i}`),categories:['a','b','c'],pricingRecommendation:{ebook:'€1',paperback:'€2',reasoning:'test'},bookDescription:'test',reviewStrategy:['test'],kdpUploadChecklist:['test'],...researchFields} as any}
  const identity={orderId:'o',language:'fr',targetLanguage:'French',targetMarket:'France',sourceFingerprint:'source',buildId:'build-1',briefRevision:1,briefSchemaVersion:'1.0',briefFingerprint:'brief',bookTitle:'Title',authorName:'Author',genre:'fantasy',description:'Description',modelId:'claude-opus-5',schemaVersion:'3.0',entitled:true,researchFingerprint:'research-v3'}
  const input={supabase:db,identity,generate}
  assert.equal((await cachedLaunchPack(input)).cached,false)
  assert.equal((await cachedLaunchPack(input)).cached,true)
  assert.equal(calls,1)
  assert.equal(rows.length,1)
  assert.equal(rows[0].generation_input_fingerprint,launchPackIdentity(identity))
  assert.equal(rows[0].build_id,'build-1')
  assert.equal(rows[0].brief_fingerprint,'brief')
})

test('Launch Pack cache and request identities bind every material generation input', async () => {
  const rows:any[]=[]
  const db:any={from(){let filters:any={};const chain:any={select:()=>chain,eq:(k:string,v:any)=>{filters[k]=v;return chain},maybeSingle:async()=>({data:rows.find(r=>Object.entries(filters).every(([k,v])=>r[k]===v))||null,error:null}),insert:async(row:any)=>{rows.push(row);return{error:null}}};return chain}}
  const base={orderId:'o',language:'fr',targetLanguage:'French',targetMarket:'France',sourceFingerprint:'source',buildId:'build-1',briefRevision:1,briefSchemaVersion:'1.0',briefFingerprint:'brief',bookTitle:'Title',authorName:'Author',genre:'fantasy',description:'Description',modelId:'claude-opus-5',schemaVersion:'3.0',entitled:true,researchFingerprint:'research-v3'}
  const changes=[
    {bookTitle:'Changed title'}, {authorName:'Changed author'}, {genre:'romance'}, {description:'Changed description'},
    {targetMarket:'Canada'}, {targetLanguage:'Canadian French'}, {briefFingerprint:'changed-brief'},
    {briefRevision:2}, {briefSchemaVersion:'2.0'}, {buildId:'build-2'}, {sourceFingerprint:'changed-source'},
    {researchFingerprint:'changed-research'}, {language:'fr-ca'},
  ]
  const identities=[base,...changes.map(change=>({...base,...change}))]
  assert.equal(new Set(identities.map(launchPackIdentity)).size,identities.length)
  assert.equal(new Set(identities.map(value=>launchPackRequestIdentity(launchPackIdentity(value)))).size,identities.length)

  let calls=0
  for(const identity of identities.slice(0,-1)){
    const market=launchMarket('fr')
    const result=await cachedLaunchPack({supabase:db,identity,generate:async()=>{calls++;return {schemaVersion:'3.0',...market,backendKeywords:['1','2','3','4','5','6','7'],adKeywords:Array.from({length:20},(_,i)=>`a${i}`),categories:['a','b','c'],pricingRecommendation:{ebook:'€1',paperback:'€2',reasoning:'test'},bookDescription:'test',reviewStrategy:['test'],kdpUploadChecklist:['test'],...researchFields} as any}})
    assert.equal(result.cached,false)
  }
  assert.equal(calls,identities.length-1)
  assert.equal(rows.length,identities.length-1)
  const unchanged=await cachedLaunchPack({supabase:db,identity:base,generate:async()=>{throw new Error('unchanged input must reuse cache')}})
  assert.equal(unchanged.cached,true)
})

function artifact(buildId: string, type: PackageArtifact['type']): PackageArtifact {
  return { id: `${buildId}-${type}`, buildId, type, required: true, filename: `${type}.bin`, storageBucket: 'booklingua-private-artifacts', storagePath: `${buildId}/${type}`, sha256: `hash-${type}`, sizeBytes: 10, validationStatus: 'pass' }
}
function manifest(language: string): PackageManifestV1 {
  const buildId = `build-${language}`
  const entitlements = { sourceFormat: 'epub' as const, launchPack: true, dualFormat: true }
  return { schemaVersion: '1.0', orderId: 'order-1', language, buildId, status: 'pass', entitlements, artifacts: requiredArtifactTypes(entitlements).map(type => artifact(buildId, type)), errors: [], generatedAt: '2026-08-13T00:00:00Z' }
}

function mockSupabase(statuses: string[]) {
  const rows = [{ language: 'fr', manifest: manifest('fr') }, { language: 'de', manifest: manifest('de') }]
  const events = new Map<string, any>()
  return {
    events,
    rpc: async () => ({ data: statuses.shift(), error: null }),
    from(table: string) {
      if (table === 'package_manifests') {
        const chain: any = { select: () => chain, eq: () => chain }
        chain.then = (resolve: any) => resolve({ data: rows, error: null })
        return chain
      }
      const chain: any = {
        insert: (row: any) => { if (events.has(row.id)) return Promise.resolve({ error: { code: '23505' } }); events.set(row.id, row); return Promise.resolve({ error: null }) },
        select: () => chain,
        update: (values: any) => { chain.values = values; return chain },
        eq: (_key: string, id: string) => {
          if (chain.values) { events.set(id, { ...events.get(id), ...chain.values }); return Promise.resolve({ error: null }) }
          chain.id = id; return chain
        },
        single: async () => ({ data: events.get(chain.id), error: null }),
      }
      return chain
    },
  }
}

test('semantic aggregate finalization stays closed when partial and sends review exactly once after both PASS', async () => {
  const priorSecret = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-test-secret'
  const db = mockSupabase(['gate_failed', 'ready_for_review', 'ready_for_review'])
  const sends: any[] = []
  const input = { supabase: db, orderId: 'order-1', bookTitle: 'Synthetic', languages: ['fr','de'], internalReviewAddress: 'internal@example.test', appUrl: 'https://example.test', sendInternalReview: async (message: any, options: any) => { sends.push({ message, options }); return { id: 'provider-1' } } }
  assert.deepEqual(await finalizeSemanticOrder(input), { status: 'gate_failed', reviewEventCreated: false, emailSent: false })
  assert.equal((await finalizeSemanticOrder(input)).status, 'ready_for_review')
  assert.match(sends[0].message.subject, /PASS.*fr, de/); assert.match(sends[0].message.html, /launch_pack/); assert.match(sends[0].message.html, /chapter_map_csv/)
  assert.equal((await finalizeSemanticOrder(input)).emailSent, false)
  assert.equal(sends.length, 1); assert.equal(db.events.size, 1); assert.equal(Array.from(db.events.values())[0].status, 'passed')
  priorSecret === undefined ? delete process.env.STRIPE_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET = priorSecret
})

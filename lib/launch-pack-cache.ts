import { createHash } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'

export const LAUNCH_PACK_TEMPLATE_VERSION = 'launch-pack-research-v3'

function canonicalJson(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`
  if(value&&typeof value==='object')return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

export interface LaunchPackGenerationIdentityInput {
  orderId: string
  language: string
  targetLanguage: string
  targetMarket: string
  sourceFingerprint: string
  buildId: string
  briefRevision: number
  briefSchemaVersion: string
  briefFingerprint: string
  bookTitle: string
  authorName: string
  genre: string
  description: string
  modelId: string
  schemaVersion: string
  entitled: boolean
  researchFingerprint: string
}

function uuidFromHash(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0,32).split('')
  hex[12]='5'; hex[16]=((parseInt(hex[16],16)&3)|8).toString(16)
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`
}

export function launchPackIdentity(input: LaunchPackGenerationIdentityInput): string {
  return createHash('sha256').update(canonicalJson({
    orderId: input.orderId,
    language: input.language,
    targetLanguage: input.targetLanguage,
    targetMarket: input.targetMarket,
    sourceFingerprint: input.sourceFingerprint,
    buildId: input.buildId,
    briefRevision: input.briefRevision,
    briefSchemaVersion: input.briefSchemaVersion,
    briefFingerprint: input.briefFingerprint,
    bookTitle: input.bookTitle,
    authorName: input.authorName,
    genre: input.genre,
    description: input.description,
    modelId: input.modelId,
    schemaVersion: input.schemaVersion,
    templateVersion: LAUNCH_PACK_TEMPLATE_VERSION,
    entitled: input.entitled,
    researchFingerprint: input.researchFingerprint,
  })).digest('hex')
}

export function launchPackRequestIdentity(identityFingerprint: string): string {
  return `launch-pack:${identityFingerprint}`
}

export async function cachedLaunchPack(input: {
  supabase: SupabaseClient
  identity: LaunchPackGenerationIdentityInput
  generate: (identityFingerprint: string) => Promise<LaunchPackV1>
}): Promise<{ pack: LaunchPackV1; cached: boolean; identity: string }> {
  const identity = launchPackIdentity(input.identity)
  const { data: existing, error: lookupError } = await input.supabase.from('launch_pack_results')
    .select('content,content_sha256').eq('order_id',input.identity.orderId).eq('language',input.identity.language).eq('identity_fingerprint',identity).maybeSingle()
  if (lookupError) throw new Error(`Launch Pack cache lookup failed: ${lookupError.message}`)
  if (existing?.content) {
    const bytes=Buffer.from(canonicalJson(existing.content))
    if (createHash('sha256').update(bytes).digest('hex')!==existing.content_sha256) throw new Error('Launch Pack cache hash mismatch')
    const errors=validateLaunchPack({pack:existing.content as LaunchPackV1,expectedLocale:input.identity.language,purchased:input.identity.entitled})
    if(errors.length)throw new Error(`Cached Launch Pack validation failed: ${errors.join('; ')}`)
    return {pack:existing.content as LaunchPackV1,cached:true,identity}
  }
  const pack=await input.generate(identity)
  const errors=validateLaunchPack({pack,expectedLocale:input.identity.language,purchased:input.identity.entitled})
  if(errors.length)throw new Error(`Generated Launch Pack validation failed: ${errors.join('; ')}`)
  const bytes=Buffer.from(canonicalJson(pack)); const contentSha256=createHash('sha256').update(bytes).digest('hex')
  const {error}=await input.supabase.from('launch_pack_results').insert({
    id:uuidFromHash(launchPackRequestIdentity(identity)),order_id:input.identity.orderId,language:input.identity.language,
    identity_fingerprint:identity,generation_input_fingerprint:identity,source_fingerprint:input.identity.sourceFingerprint,
    build_id:input.identity.buildId,brief_revision:input.identity.briefRevision,brief_schema_version:input.identity.briefSchemaVersion,
    brief_fingerprint:input.identity.briefFingerprint,
    model_id:input.identity.modelId,schema_version:input.identity.schemaVersion,template_version:LAUNCH_PACK_TEMPLATE_VERSION,
    content:pack,content_sha256:contentSha256,
  })
  if(error?.code==='23505')return cachedLaunchPack(input)
  if(error)throw new Error(`Launch Pack cache persistence failed: ${error.message}`)
  return {pack,cached:false,identity}
}

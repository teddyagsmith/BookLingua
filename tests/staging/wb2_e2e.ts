import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { runSemanticPipeline } from '../../lib/semantic-pipeline'
import { buildTranslationBrief, translationBriefFingerprint } from '../../lib/translation-brief'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url.startsWith('http://127.0.0.1:')) throw new Error('WB2 staging test refuses non-local Supabase')
const db = createClient(url, key)

function epub(): Buffer {
  const zip: any = new AdmZip(); zip.addFile('mimetype', Buffer.from('application/epub+zip'))
  zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'))
  const items: string[] = []; const spine: string[] = []
  for (let i=1;i<=12;i++) { items.push(`<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="c${i}"/>`); zip.addFile(`OPS/c${i}.xhtml`, Buffer.from(`<html><body><h1>Chapter ${i}</h1><p>Synthetic body ${i} with enough text for validation.</p></body></html>`)) }
  zip.addFile('OPS/book.opf', Buffer.from(`<package><manifest>${items.join('')}</manifest><spine>${spine.join('')}</spine></package>`)); return zip.toBuffer()
}

async function docx(): Promise<Buffer> {
  const children: Paragraph[] = []
  for (let i=1;i<=12;i++) children.push(new Paragraph({ text:`Chapter ${i}`, heading:HeadingLevel.HEADING_1 }), new Paragraph(`Synthetic body ${i} with split-ready content.`))
  return Buffer.from(await Packer.toBuffer(new Document({sections:[{children}]})))
}

async function run(format: 'epub'|'docx'|'txt', source: Buffer, suffix: number) {
  const orderId = `91000000-0000-0000-0000-${String(suffix).padStart(12,'0')}`; const language='fr'
  const sourceHash=createHash('sha256').update(source).digest('hex')
  await db.from('orders').delete().eq('id',orderId)
  const { error: orderError } = await db.from('orders').insert({ id:orderId,email:`wb2-${suffix}@example.invalid`,author_name:'Synthetic',book_title:`WB2 ${format}`,word_count:1000,tier:'small',file_format:`.${format}`,languages:[language],amount_paid:99,status:'processing',pipeline_version:'semantic-v2' })
  if (orderError) throw orderError
  const manifest={schemaVersion:'1.0',sourceHash,sourceFormat:format,sourceSizeBytes:source.length,structureFingerprint:sourceHash,parserVersion:'synthetic',createdAt:new Date().toISOString()}
  const { error:fileError }=await db.from('files').insert({order_id:orderId,type:'source_manifest',language:'en',content:JSON.stringify(manifest),file_url:`synthetic/${orderId}`,original_content:JSON.stringify({sha256:sourceHash})}); if(fileError) throw fileError
  const brief=buildTranslationBrief({language,sourceManifestFingerprint:sourceHash,approvedAt:'2026-08-13T00:00:00.000Z',approvalSource:'admin',decisions:[]})
  const {error:briefError}=await db.from('translation_briefs').insert({order_id:orderId,language,source_manifest_fingerprint:sourceHash,schema_version:'1.0',revision:brief.revision,brief,content_fingerprint:translationBriefFingerprint(brief),approved_at:brief.approvedAt,approval_source:'admin'}); if(briefError) throw briefError
  const result=await runSemanticPipeline({supabase:db,orderId,language,sourceFormat:format,source,title:`WB2 ${format}`,brief,notes:{schemaVersion:'1.0',language,approach:'No notable translation decisions in deterministic synthetic fixture.',sections:[]},allowReviewedStructure:format==='txt',translate:async(batch,context)=>({...batch,nodes:batch.nodes.map(node=>({...node,text:`${context.pass===1?'P1':'P2'} ${node.text}`}))})})
  if(result.manifest.status!=='pass') throw new Error(`${format} package failed: ${result.manifest.errors.join('; ')}`)
  return {format,buildId:result.buildId,status:result.manifest.status,artifacts:result.manifest.artifacts.length}
}

async function main() {
  const results=[]
  results.push(await run('epub',epub(),1)); results.push(await run('docx',await docx(),2)); results.push(await run('txt',Buffer.from(Array.from({length:12},(_,i)=>`# Chapter ${i+1}\nSynthetic body ${i+1}.`).join('\n\n')),3))
  console.log(JSON.stringify(results,null,2))
}
main().catch(error => { console.error(error); process.exitCode=1 })

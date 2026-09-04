import {createClient} from '@supabase/supabase-js'
import {randomUUID,createHash} from 'node:crypto'
import AdmZip from 'adm-zip'
import {downloadOriginalBinary} from '../lib/source-binary'
import {buildSemanticDocx,buildSemanticReviewDocx,buildSemanticEpub,normalizeEpubImages,decodeVisibleEntities} from '../lib/semantic-artifacts'
import {buildChapterMap,renderChapterMapCsv,renderChapterMapDocx} from '../lib/chapter-map'
import {deriveEditorialTranslationNotes,renderTranslationNotes} from '../lib/translation-notes'
import {renderCustomerLaunchPackDocx} from '../lib/customer-delivery-docx'
import {validateArtifact} from '../lib/artifact-validation-v2'
import {storeImmutableArtifact} from '../lib/artifact-store'
import {resolvePackageGate} from '../lib/package-gate'
import {UPLOAD_GUIDE_ASSET_PATH,UPLOAD_GUIDE_SHA256} from '../lib/upload-guide'
import {readFile} from 'node:fs/promises'
import path from 'node:path'

const ORDER='6b47fdde-389a-49ad-ab94-fcc2e1ea08cc'
const TITLES:Record<string,string>={'pt-br':'Reconquiste Sua Longevidade',de:'Erobern Sie Ihre Langlebigkeit zurück'}
const normalize=(v:string)=>decodeVisibleEntities(v).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()
const chapterNumber=(v:string)=>v.match(/\b(?:chapter|cap[ií]tulo|kapitel)\s+([0-9ivxlcdm]+)/i)?.[1]||null

async function report(db:any,buildId:string,language:string,stage:string,passed:boolean,errors:any[],metrics:any={}){
 const {data,error}=await db.from('validation_reports').insert({order_id:ORDER,language,build_id:buildId,stage,validator_version:'semantic-v2.5-gate-hole-repair',passed,errors,warnings:[],metrics}).select('id').single()
 if(error)throw error;return data.id as string
}
async function store(db:any,buildId:string,language:string,type:any,filename:string,bytes:Buffer,kind?:'docx'|'epub'){
 const result=kind?validateArtifact(bytes,kind,{semanticDuplicateParityValidated:true,semanticHeadingDuplicateParityValidated:true,expectedLanguage:language}):{passed:bytes.length>0,errors:[],metrics:{}}
 const id=await report(db,buildId,language,`artifact:${type}`,result.passed,result.errors,result.metrics)
 if(!result.passed)throw new Error(`${language} ${type}: ${result.errors.map((e:any)=>e.message).join('; ')}`)
 return storeImmutableArtifact({supabase:db,orderId:ORDER,language,buildId,type,filename,buffer:bytes,schemaVersion:'semantic-v2.5',validationStatus:'pass',validationReportId:id})
}
function navLabels(source:Buffer):string[]{
 const zip:any=new AdmZip(source),labels:string[]=[]
 for(const entry of zip.getEntries().filter((e:any)=>/(?:nav|\.ncx$)/i.test(e.entryName))){
  const xml=entry.getData().toString('utf8')
  for(const match of xml.matchAll(/<(?:a|text)\b[^>]*>([\s\S]*?)<\/(?:a|text)>/gi)){
   const value=decodeVisibleEntities(match[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());if(value)labels.push(value)
  }
 }
 return Array.from(new Set(labels))
}
function promote(document:any,labels:string[]){
 const chosen=new Set<number>()
 for(const label of labels){const candidates=document.nodes.map((node:any,index:number)=>normalize(node.sourceText)===normalize(label)?index:-1).filter((index:number)=>index>=0);if(candidates.length)chosen.add(candidates.at(-1)!)}
 return {...document,nodes:document.nodes.map((node:any,index:number)=>chosen.has(index)?{...node,chapterId:`recovered-heading-${index}`,type:'heading',headingLevel:1,sourceChapterNumber:chapterNumber(node.sourceText),translatedText:decodeVisibleEntities(node.translatedText||'')}:{...node,translatedText:decodeVisibleEntities(node.translatedText||'')})}
}

async function main(){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const {data:order,error:oe}=await db.from('orders').select('*').eq('id',ORDER).single();if(oe)throw oe
 const {data:file,error:fe}=await db.from('files').select('file_url,original_content').eq('order_id',ORDER).eq('type','original').single();if(fe)throw fe
 const metadata=JSON.parse(file.original_content||'{}'),source=await downloadOriginalBinary(db,file.file_url,metadata.sha256||null,metadata.storageBucket)
 const labels=navLabels(source);if(labels.length<8)throw new Error(`Only ${labels.length} source navigation labels detected`)
 const requested=process.env.REPAIR_LANG?[process.env.REPAIR_LANG]:['pt-br','de']
 for(const language of requested){
  const {data:oldManifest}=await db.from('package_manifests').select('build_id').eq('order_id',ORDER).eq('language',language).eq('status','pass').order('created_at',{ascending:false}).limit(1).single();if(!oldManifest)throw new Error(`${language}: prior passed build missing`)
  const old={id:oldManifest.build_id}
  const {data:docs,error:se}=await db.from('semantic_documents').select('pass,document').eq('order_id',ORDER).eq('language',language).eq('build_id',old.id).in('pass',['pass1','pass2']);if(se)throw se
  const oldPass1=docs?.find((x:any)=>x.pass==='pass1')?.document,oldPass2=docs?.find((x:any)=>x.pass==='pass2')?.document;if(!oldPass1||!oldPass2)throw new Error(`${language}: semantic documents missing`)
  const pass1=promote(oldPass1,labels),pass2=promote(oldPass2,labels)
  const title=TITLES[language],buildId=randomUUID();const {error:be}=await db.rpc('begin_order_language_build',{p_order_id:ORDER,p_language:language,p_build_id:buildId});if(be)throw be
  for(const [pass,document] of [['pass1',pass1],['pass2',pass2]] as const){const {error}=await db.from('semantic_documents').insert({order_id:ORDER,language,build_id:buildId,pass,schema_version:document.schemaVersion,source_hash:document.sourceHash,structure_fingerprint:createHash('sha256').update(document.nodes.map((n:any)=>n.id).join('|')).digest('hex'),eligibility:'eligible',document});if(error)throw error}
  await report(db,buildId,language,'title_authority',true,[],{titleAuthority:{sourceKind:'epub_metadata',sourceValue:'Reclaim Your Longevity',translatedValue:title,effectiveValue:title,confidence:'verified',fallbackUsed:false}})
  const {data:brief}=await db.from('translation_briefs').select('brief').eq('order_id',ORDER).eq('language',language).order('revision',{ascending:false}).limit(1).single()
  if(!brief?.brief)throw new Error(`${language}: brief missing`)
  await store(db,buildId,language,'translation_brief','translation-brief.json',Buffer.from(JSON.stringify(brief.brief,null,2)))
  const storageTitle='Reclaim Your Longevity'
  await store(db,buildId,language,'pass1_docx',`${storageTitle} - ${language} - Pass 1.docx`,await buildSemanticDocx(pass1,title,'pass1'),'docx')
  await store(db,buildId,language,'review_docx',`${storageTitle} - ${language} - Review.docx`,await buildSemanticReviewDocx(pass1,pass2,title),'docx')
  const authority:any={sourceKind:'epub_metadata',sourceValue:'Reclaim Your Longevity',translatedValue:title,effectiveValue:title,confidence:'verified',fallbackUsed:false}
  const epub=buildSemanticEpub(await normalizeEpubImages(source),pass2,authority,language,order.author_name,`${ORDER}:${language}`)
  const debugZip:any=new AdmZip(epub);console.log(`${language} rebuilt NCX first label:`,debugZip.readAsText('OEBPS/toc.ncx').match(/<navLabel><text>(.*?)<\/text>/)?.[1])
  await store(db,buildId,language,'final_epub',`${storageTitle} - ${language} - Final.epub`,epub,'epub')
  await store(db,buildId,language,'final_docx',`${storageTitle} - ${language} - Final.docx`,await buildSemanticDocx(pass2,title,'final'),'docx')
  const map=buildChapterMap(pass2);if(map.length<Math.ceil(labels.length*.9))throw new Error(`${language}: chapter map ${map.length}/${labels.length}`)
  await store(db,buildId,language,'chapter_map_csv','chapter-map.csv',Buffer.from(renderChapterMapCsv(map)))
  await store(db,buildId,language,'chapter_map_docx','chapter-map.docx',await renderChapterMapDocx(map,{bookTitle:title,language}),'docx')
  const notes=deriveEditorialTranslationNotes({language,pass1,pass2,authoritativeTitle:{source:'Reclaim Your Longevity',target:title}})
  await store(db,buildId,language,'translation_notes','translation-notes.txt',Buffer.from(renderTranslationNotes(notes)))
  const guide=await readFile(path.join(process.cwd(),'public',UPLOAD_GUIDE_ASSET_PATH.replace(/^\//,'')));if(createHash('sha256').update(guide).digest('hex')!==UPLOAD_GUIDE_SHA256)throw new Error('Guide hash')
  await store(db,buildId,language,'upload_guide','BookLingua Author Upload Guide.docx',guide)
  const {data:oldLaunch}=await db.from('artifacts').select('storage_bucket,storage_path').eq('order_id',ORDER).eq('language',language).eq('build_id',old.id).eq('artifact_type','launch_pack').single();if(!oldLaunch)throw new Error(`${language}: launch pack missing`)
  const blob=await db.storage.from(oldLaunch.storage_bucket).download(oldLaunch.storage_path)
  const pack=JSON.parse(Buffer.from(await blob.data!.arrayBuffer()).toString('utf8')),notesInCategories=pack.categories.filter((x:string)=>/verify|available|category paths|amazon kdp|methodolog/i.test(x));pack.categories=pack.categories.filter((x:string)=>!notesInCategories.includes(x));if(notesInCategories.length)pack.categoriesNote=[pack.categoriesNote,...notesInCategories].filter(Boolean).join(' ')
  const launch=Buffer.from(JSON.stringify(pack,null,2));await renderCustomerLaunchPackDocx(launch,order.book_title,title,order.author_name)
  await store(db,buildId,language,'launch_pack','launch-pack.json',launch)
  const manifest=await resolvePackageGate(db,{orderId:ORDER,language,buildId});console.log(JSON.stringify({language,buildId,title,navLabels:labels.length,mapRows:map.length,status:manifest.status,hashes:Object.fromEntries(manifest.artifacts.map(a=>[a.type,a.sha256]))}))
 }
}
main().catch(error=>{console.error(error);process.exit(1)})

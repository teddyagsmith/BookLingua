import { createHash } from 'crypto'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { deterministicDocx } from './deterministic-docx'
import { SemanticDocumentV2, SemanticNodeV2 } from './semantic-document'
import { customerLanguageName, sanitizeCustomerFilenamePart } from './customer-delivery'
import { signReaderPanelToken } from './download-token'

export const READER_SAMPLE_VERSION = 'reader-sample-v1'
export const READER_PANEL_TEMPLATE_VERSION = 'reader-panel-email-v1'
export const READER_PANEL_RECIPIENT = 'gilly@myromancereads.com'
export type ReaderReviewVerdict = 'reader_review_pass'|'reader_review_pass_with_notes'|'reader_review_fail'
export type ReaderSampleSection = { label:'Opening'|'Middle'|'Translation stress'; startOrder:number; endOrder:number; wordCount:number; nodes:SemanticNodeV2[] }

const words=(value:string|null)=>value?.trim().split(/\s+/).filter(Boolean).length||0
const prose=(node:SemanticNodeV2)=>node.type!=='heading'&&node.type!=='scene_break'&&words(node.translatedText)>0

function continuousWindow(nodes:SemanticNodeV2[],anchor:number,target:number):ReaderSampleSection['nodes']{
  if(!nodes.length)return[]
  let start=Math.max(0,Math.min(nodes.length-1,anchor)),end=start,total=0
  while(end<nodes.length&&total<target){total+=words(nodes[end].translatedText);end++}
  while(start>0&&total<target){start--;total+=words(nodes[start].translatedText)}
  return nodes.slice(start,end)
}

function stressScore(node:SemanticNodeV2):number{
  const text=node.translatedText||''
  return Math.min(8,(text.match(/[“”"'!?—–:;]/g)||[]).length)+Math.min(8,words(text)/25)+(node.type==='paragraph'?2:0)
}

export function selectReaderSample(document:SemanticDocumentV2,targetPerSection=2700):ReaderSampleSection[]{
  const eligible=document.nodes.filter(node=>node.translatedText?.trim())
  const proseIndexes=eligible.map((node,index)=>prose(node)?index:-1).filter(index=>index>=0)
  if(!proseIndexes.length)throw new Error('Reader sample has no translated prose')
  const opening=continuousWindow(eligible,proseIndexes[0],targetPerSection)
  const middleAnchor=proseIndexes[Math.floor(proseIndexes.length/2)]
  const middle=continuousWindow(eligible,middleAnchor,targetPerSection)
  const excluded=new Set([...opening,...middle].map(node=>node.id))
  const candidates=eligible.map((node,index)=>({node,index,score:excluded.has(node.id)?-1:stressScore(node)})).sort((a,b)=>b.score-a.score||a.index-b.index)
  const stress=continuousWindow(eligible,candidates[0]?.index??proseIndexes[proseIndexes.length-1],targetPerSection)
  const section=(label:ReaderSampleSection['label'],nodes:SemanticNodeV2[]):ReaderSampleSection=>({label,nodes,startOrder:nodes[0].order,endOrder:nodes[nodes.length-1].order,wordCount:nodes.reduce((n,node)=>n+words(node.translatedText),0)})
  return [section('Opening',opening),section('Middle',middle),section('Translation stress',stress)]
}

export function readerSampleWordCount(sections:ReaderSampleSection[]):number{return sections.reduce((n,section)=>n+section.wordCount,0)}
export function readerPanelIdentity(orderId:string,language:string,buildId:string,customerPackageVersion:string):string{
  return createHash('sha256').update([orderId,language,buildId,customerPackageVersion,READER_SAMPLE_VERSION].join(':')).digest('hex')
}
export function readerSampleFilename(bookTitle:string,language:string):string{return `${sanitizeCustomerFilenamePart(bookTitle)} - Reader Sample - ${language.toUpperCase()}.docx`}

export async function buildReaderSampleDocx(input:{document:SemanticDocumentV2;translatedTitle:string;language:string;sections?:ReaderSampleSection[]}):Promise<Buffer>{
  const sections=input.sections||selectReaderSample(input.document),count=readerSampleWordCount(sections)
  const children:Paragraph[]=[
    new Paragraph({text:'BookLingua Reader Panel',heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER}),
    new Paragraph({children:[new TextRun({text:input.translatedTitle,bold:true,size:32})],alignment:AlignmentType.CENTER,spacing:{after:240}}),
    new Paragraph({text:customerLanguageName(input.language),alignment:AlignmentType.CENTER}),
    new Paragraph({text:`Approximate sample word count: ${count.toLocaleString('en-GB')}`,alignment:AlignmentType.CENTER,spacing:{after:360}}),
    new Paragraph({text:"Read this naturally as you would any other book. Please don't actively proofread while reading. If something feels translated or interrupts your reading, note the chapter/paragraph so you can include it in the feedback form.",alignment:AlignmentType.CENTER,pageBreakBefore:false}),
  ]
  for(const section of sections){
    children.push(new Paragraph({text:section.label,heading:HeadingLevel.HEADING_1,pageBreakBefore:true}))
    for(const node of section.nodes){
      if(node.type==='heading')children.push(new Paragraph({text:node.translatedText!,heading:node.headingLevel===1?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3}))
      else if(node.type==='scene_break')children.push(new Paragraph({text:'* * *',alignment:AlignmentType.CENTER}))
      else children.push(new Paragraph({text:node.translatedText!,alignment:AlignmentType.JUSTIFIED,spacing:{after:100},indent:node.type==='paragraph'?{firstLine:360}:undefined,bullet:node.type==='list_item'?{level:0}:undefined}))
    }
  }
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({sections:[{children}]}))))
}

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
export function renderReaderPanelEmail(input:{bookTitle:string;translatedTitle:string;language:string;genre:string;wordCount:number;sections:ReaderSampleSection[];sampleUrl:string;feedbackUrl:string}){
  const language=customerLanguageName(input.language)
  const subject=`[BOOKLINGUA READER PANEL] ${language} check needed — ${input.bookTitle}`
  const labels=input.sections.map(section=>`<li>${escape(section.label)}: ${section.wordCount.toLocaleString('en-GB')} words</li>`).join('')
  return {subject,html:`<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#241b3a"><div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#5b21b6;color:#fff;padding:28px"><h1 style="margin:0">BookLingua Reader Panel</h1></div><div style="padding:28px"><p><strong>${escape(input.translatedTitle)}</strong><br>Original title: ${escape(input.bookTitle)}<br>Language: ${escape(language)}<br>Genre: ${escape(input.genre||'Not specified')}<br>Sample: approximately ${input.wordCount.toLocaleString('en-GB')} words</p><p>Please arrange a natural read within 48 hours. Teddy manually assigns this request to a reader; this email is not sent to panel readers automatically.</p><ul>${labels}</ul><p><a href="${escape(input.sampleUrl)}" style="display:inline-block;background:#5b21b6;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Download Reader Sample</a></p><p><a href="${escape(input.feedbackUrl)}">Download the Reader Panel Feedback Form</a></p></div></div></body></html>`,templateVersion:READER_PANEL_TEMPLATE_VERSION}
}

export type ReaderPanelSender=(message:{from:string;to:string[];subject:string;html:string},options:{idempotencyKey:string})=>Promise<{id?:string}>
export async function createReaderPanelRequests(input:{supabase:any;orderId:string;bookTitle:string;genre:string;languages:string[];customerPackageVersion:string;appUrl:string;send:ReaderPanelSender;feedbackFormConfidenceConfirmed:boolean}){
  const results=[]
  for(const language of input.languages){
    const {data:build,error:buildError}=await input.supabase.from('order_language_builds').select('id').eq('order_id',input.orderId).eq('language',language).eq('is_current',true).single()
    if(buildError||!build)throw new Error(`Current reader-panel build unavailable for ${language}`)
    const {data:semantic,error:semanticError}=await input.supabase.from('semantic_documents').select('document').eq('order_id',input.orderId).eq('language',language).eq('build_id',build.id).eq('pass','pass2').single()
    if(semanticError||!semantic?.document)throw new Error(`Authoritative Pass 2 document unavailable for ${language}`)
    const document=semantic.document as SemanticDocumentV2,sections=selectReaderSample(document),wordCount=readerSampleWordCount(sections)
    if(wordCount<7000||wordCount>9000)throw new Error(`Reader sample word count outside 7,000–9,000 for ${language}: ${wordCount}`)
    const identity=readerPanelIdentity(input.orderId,language,build.id,input.customerPackageVersion)
    const filename=readerSampleFilename(input.bookTitle,language),buffer=await buildReaderSampleDocx({document,translatedTitle:document.nodes.find(node=>node.type==='heading')?.translatedText||input.bookTitle,language,sections})
    const sha256=createHash('sha256').update(buffer).digest('hex'),bucket='booklingua-private-artifacts',storagePath=`${input.orderId}/${language}/${build.id}/reader_sample/${sha256}/${filename}`
    const {error:uploadError}=await input.supabase.storage.from(bucket).upload(storagePath,buffer,{upsert:false,contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
    if(uploadError&&!/already exists/i.test(uploadError.message))throw new Error(`Reader sample upload failed: ${uploadError.message}`)
    const selection=sections.map(({label,startOrder,endOrder,wordCount})=>({label,startOrder,endOrder,wordCount}))
    const {data:request,error:insertError}=await input.supabase.from('reader_panel_requests').insert({order_id:input.orderId,language,build_id:build.id,customer_package_version:input.customerPackageVersion,sample_version:READER_SAMPLE_VERSION,request_identity:identity,sample_storage_bucket:bucket,sample_storage_path:storagePath,sample_filename:filename,sample_sha256:sha256,sample_word_count:wordCount,selection,feedback_form_version:'approved-pdf-2026-08-11'}).select('*').single()
    let row=request
    if(insertError?.code==='23505'){
      const existing=await input.supabase.from('reader_panel_requests').select('*').eq('request_identity',identity).single();if(existing.error)throw new Error(`Reader request retry lookup failed: ${existing.error.message}`);row=existing.data
      if(row.sample_sha256!==sha256||row.sample_word_count!==wordCount)throw new Error('Reader sample retry differs from immutable request')
    }else if(insertError)throw new Error(`Reader request persistence failed: ${insertError.message}`)
    if(row.email_state==='sent'){results.push({language,wordCount,emailSent:false,duplicate:true});continue}
    if(!input.feedbackFormConfidenceConfirmed)throw new Error('Approved feedback form is missing the required Translation Confidence question; reader-panel email blocked')
    const token=signReaderPanelToken(identity),sampleUrl=`${input.appUrl}/api/reader-panel/${identity}/sample?token=${token}`,feedbackUrl=`${input.appUrl}/BookLingua_Reader_Panel_Feedback_Form.pdf`
    const email=renderReaderPanelEmail({bookTitle:input.bookTitle,translatedTitle:document.nodes.find(node=>node.type==='heading')?.translatedText||input.bookTitle,language,genre:input.genre,wordCount,sections,sampleUrl,feedbackUrl})
    const sent=await input.send({from:'BookLingua Reader Panel <hello@booklingua.io>',to:[READER_PANEL_RECIPIENT],subject:email.subject,html:email.html},{idempotencyKey:`reader-panel/${identity}`})
    const {error:updateError}=await input.supabase.from('reader_panel_requests').update({email_state:'sent',provider_message_id:sent.id||null,requested_at:new Date().toISOString()}).eq('id',row.id).eq('email_state','pending')
    if(updateError)throw new Error(`Reader request completion failed: ${updateError.message}`)
    results.push({language,wordCount,emailSent:true,duplicate:false})
  }
  const {data:status,error:statusError}=await input.supabase.rpc('resolve_reader_panel_gate',{p_order_id:input.orderId})
  if(statusError)throw new Error(`Reader panel gate failed: ${statusError.message}`)
  return {status,results}
}

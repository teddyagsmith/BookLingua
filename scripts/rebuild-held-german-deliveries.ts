import AdmZip from 'adm-zip'
import {createClient} from '@supabase/supabase-js'
import {createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {downloadOriginalBinary} from '../lib/source-binary'
import {parseSemanticDocx} from '../lib/semantic-parser'
import {createDeterministicSemanticBatches,semanticBatchIdentity} from '../lib/semantic-batching'
import {createNodeTranslationInput} from '../lib/node-translation-contract'
import {BOOKLINGUA_MODEL_CONFIG} from '../lib/model-config'
import {EDITORIAL_PROMPT_VERSION,TRANSLATION_PROMPT_VERSION} from '../lib/editorial-prompt'
import {deterministicSemanticBuildId,runSemanticPipeline,SEMANTIC_PROMPT_SIGNATURE} from '../lib/semantic-pipeline'
import {translationBriefFingerprint,TranslationBriefV1} from '../lib/translation-brief'
import {auditBookWideExplanatoryNotes,VerifiedExplanatoryNote} from '../lib/explanatory-notes'
import {inspectDeliveredDocx} from '../lib/delivery-contract'
import {normalizeTypography} from '../lib/typography'
import {normalizeGermanTerminology} from '../lib/german-terminology'
import {renderCustomerTranslationNotesDocx} from '../lib/customer-delivery-docx'
import {explanatorySpans} from '../lib/explanatory-notes'
import {TranslationNotesV1,validateCustomerTranslationNotes} from '../lib/translation-notes'

const LANGUAGE='de'
const customerNotes=(approach:string,entries:Array<{source:string;target:string;reason:string}>):TranslationNotesV1=>({
  schemaVersion:'1.0',language:'de',approach,sections:[{id:'translation-decisions',title:'Translation Decisions',entries}],
})
const JOBS=[
  {
    orderId:'f8129c37-d566-4b87-98a4-d981d8c949de',title:'Never Look Back',verifiedTitle:'Never Look Back',launchPack:true,
    explanations:[
      {sourceTerm:'high school',targetTerm:'Highschool-Foto',canonicalNote:'Highschool: die amerikanische Oberstufe'},
      {sourceTerm:'DMV',targetTerm:'DMV',canonicalNote:'US-amerikanische Kraftfahrzeugbehörde'},
    ] satisfies VerifiedExplanatoryNote[],
    overrides:[
      {nodeId:'node-000127',before:'Es waren die zwanzig Prozent nicht-legal, die mir Sorgen bereiteten.',after:'Die übrigen zwanzig Prozent machten mir Sorgen.'},
    ],
    notes:customerNotes('These notes connect the author’s English wording directly to the exact German wording in the delivered Final.',[
      {source:'Never Look Back',target:'Never Look Back',reason:'The English series title is retained unchanged in German to preserve the established Midnight Riders title and branding.'},
      {source:'It was the twenty-percent not legit I was worried about.',target:'Die übrigen zwanzig Prozent machten mir Sorgen.',reason:'The deliberately colloquial percentage construction becomes natural German while retaining the narrator’s blunt concern and biker-thriller voice.'},
      {source:'high school',target:'Highschool-Foto (Highschool: die amerikanische Oberstufe)',reason:'The author-approved first-occurrence note explains the US school term briefly while the German compound follows standard Highschool spelling.'},
      {source:'DMV',target:'DMV (US-amerikanische Kraftfahrzeugbehörde)',reason:'The author-approved first-occurrence note retains the US agency abbreviation and gives German readers its function without relocating the setting.'},
    ]),
    preserveFinalSha256:'d6e3bf1f6f691671610b4ffd6f90d2fc6ad4c4bdd493b3bc35f5ad6efa30fad8',
  },
  {
    orderId:'6543360d-c0f9-43ba-9437-eb15256c8190',title:'Ashes of Betrayal',verifiedTitle:'Asche des Verrats',launchPack:false,
    explanations:[] satisfies VerifiedExplanatoryNote[],
    overrides:[
      {nodeId:'node-000150',before:'im sonnigen Slowakei',after:'in der sonnigen Slowakei'},
      {nodeId:'node-000780',before:'Gib ihm ein Muster, und er wird Absicht sehen, selbst wenn keine da ist.',after:'Gibt man ihm ein Muster, sieht er Absicht, selbst wo keine ist.'},
      {nodeId:'node-000796',before:'der vertraute, bodenständige Tonfall weich an den Rändern',after:'der vertraute, bodenständige Ton plötzlich weicher'},
      {nodeId:'node-001145',before:'Ash bewegte sich aus dem Muskelgedächtnis heraus durch das verdunkelte Haus, die Pistole tief.',after:'Ash bewegte sich wie automatisch durch das dunkle Haus, die Waffe gesenkt.'},
    ],
    notes:customerNotes('These notes connect representative English source phrases directly to the exact German wording in the delivered Final.',[
      {source:'Enjoy your holiday in sunny Slovakia',target:'Genießen Sie Ihren Urlaub in der sonnigen Slowakei',reason:'The German uses the feminine country construction in der Slowakei while preserving the pilot’s dry, formal announcement.'},
      {source:"Give him a pattern, and he'll see intention even when it isn't there.",target:'Gibt man ihm ein Muster, sieht er Absicht, selbst wo keine ist.',reason:'The generic English you is rendered with impersonal German man, keeping the observation general rather than addressing a particular person.'},
      {source:'the familiar down-home burr soft around the edges',target:'der vertraute, bodenständige Ton plötzlich weicher',reason:'The regional idiom is adapted into natural German voice description rather than translated literally, preserving Huxley’s softened delivery.'},
      {source:'on muscle memory, pistol low',target:'wie automatisch durch das dunkle Haus, die Waffe gesenkt',reason:'The compressed action beat becomes idiomatic German while keeping Ash’s automatic movement and the weapon’s lowered position clear.'},
    ]),
    preserveFinalSha256:'4d4d922d3a72936c95b60b2b2b0e4f39f6854430ff718e217c95d3a0d9ddd88e',
  },
] as const

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})

async function downloadArtifact(artifact:any):Promise<Buffer>{
  const blob=await db.storage.from(artifact.storage_bucket||artifact.storageBucket).download(artifact.storage_path||artifact.storagePath)
  if(blob.error||!blob.data)throw new Error(blob.error?.message||`Artifact unavailable: ${artifact.artifact_type||artifact.type}`)
  return Buffer.from(await blob.data.arrayBuffer())
}

async function seedPassCaches(orderId:string,brief:TranslationBriefV1,sourceDocument:any,currentBuildId:string){
  const rows=await db.from('semantic_documents').select('pass,document').eq('order_id',orderId).eq('language',LANGUAGE).eq('build_id',currentBuildId).in('pass',['pass1','pass2'])
  if(rows.error)throw new Error(`Current semantic documents unavailable: ${rows.error.message}`)
  const stored=Object.fromEntries((rows.data||[]).map(row=>[row.pass,row.document])) as Record<string,any>
  if(!stored.pass1||!stored.pass2)throw new Error('Current Pass 1/Pass 2 pair is incomplete')
  if(stored.pass1.nodes.length!==sourceDocument.nodes.length||stored.pass2.nodes.length!==sourceDocument.nodes.length)throw new Error('Current semantic node count changed')
  const briefFingerprint=translationBriefFingerprint(brief)
  const normalizedPass1={...stored.pass1,nodes:stored.pass1.nodes.map((node:any)=>node.translatedText?{...node,translatedText:normalizeGermanTerminology(normalizeTypography(node.translatedText,LANGUAGE))}:node)}
  const passInputs=[
    {pass:1 as const,authoritative:sourceDocument.nodes,output:stored.pass1.nodes,model:BOOKLINGUA_MODEL_CONFIG.translation,prompt:TRANSLATION_PROMPT_VERSION},
    {pass:2 as const,authoritative:normalizedPass1.nodes,output:stored.pass2.nodes,model:BOOKLINGUA_MODEL_CONFIG.editorial,prompt:EDITORIAL_PROMPT_VERSION},
  ]
  let seeded=0
  for(const item of passInputs){
    const batches=createDeterministicSemanticBatches(item.authoritative)
    const documentFingerprint=createNodeTranslationInput(item.authoritative).sourceFingerprint
    const byId=new Map(item.output.map((node:any)=>[node.id,node]))
    for(const batch of batches){
      const request=createNodeTranslationInput(batch.nodes,item.pass===2)
      const outputNodes=batch.nodes.map((node:any)=>{
        const prior:any=byId.get(node.id)
        if(!prior||prior.sourceText!==node.sourceText||!prior.translatedText?.trim())throw new Error(`Cannot bridge ${item.pass}/${node.id}`)
        return{id:node.id,text:prior.translatedText}
      })
      const batchId=semanticBatchIdentity({orderId,language:LANGUAGE,documentFingerprint,pass:item.pass,orderedNodeIds:batch.orderedNodeIds,briefRevision:brief.revision,briefFingerprint,modelId:item.model,schemaVersion:request.schemaVersion,promptVersion:item.prompt})
      const content=JSON.stringify({schemaVersion:request.schemaVersion,sourceFingerprint:request.sourceFingerprint,nodes:outputNodes})
      const upsert=await db.from('translation_chunks').upsert({order_id:orderId,lang_code:LANGUAGE,chunk_index:batch.index,pass:`semantic-pass${item.pass}`,content,pipeline_version:'semantic-v2',schema_version:request.schemaVersion,structure_fingerprint:batchId,model_provider:BOOKLINGUA_MODEL_CONFIG.provider,model_id:item.model,model_stage:item.pass===1?'translation':'editorial'},{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id'})
      if(upsert.error)throw new Error(`Cache bridge failed: ${upsert.error.message}`)
      seeded++
    }
  }
  return seeded
}

function xmlParagraphs(buffer:Buffer){
  const zip:any=new AdmZip(buffer),xml=zip.getEntry('word/document.xml')?.getData().toString('utf8')||''
  const decode=(value:string)=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')
  let joins=0,affected=0
  for(const paragraph of (Array.from(xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) as RegExpMatchArray[]).map(match=>match[0])){
    const values=(Array.from(paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) as RegExpMatchArray[]).map(match=>decode(match[1])).filter(Boolean)
    let paragraphJoins=0
    for(let index=1;index<values.length;index++)if(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]$/.test(values[index-1])&&/^[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(values[index]))paragraphJoins++
    joins+=paragraphJoins;if(paragraphJoins)affected++
  }
  return{gluedJoins:joins,affectedParagraphs:affected}
}

function reasonsFromNotes(buffer:Buffer){
  const reasons=buffer.toString('utf8').split('\n').filter(line=>line.startsWith('Reason: ')).map(line=>line.slice(8).trim())
  return{count:reasons.length,unique:new Set(reasons.map(reason=>reason.normalize('NFKC').toLocaleLowerCase())).size,specific:reasons.filter(reason=>reason.length>=45&&/[“”"]/.test(reason)).length}
}

function notesAudit(buffer:Buffer,genre:string){
  const text=buffer.toString('utf8'),lines=text.split('\n'),entries=[] as Array<{before:string;after:string;reason:string}>
  for(let index=0;index<lines.length;index++){
    const arrow=lines[index].indexOf(' → ')
    if(arrow<0||!lines[index+1]?.startsWith('Reason: '))continue
    entries.push({before:lines[index].slice(0,arrow),after:lines[index].slice(arrow+3),reason:lines[index+1].slice(8)})
  }
  return{
    entryCount:entries.length,uniqueReasons:new Set(entries.map(item=>item.reason.normalize('NFKC').toLocaleLowerCase())).size,
    identicalBeforeAfter:entries.filter(item=>item.before===item.after&&!/retained unchanged|kept unchanged/i.test(item.reason)),
    genreInappropriateReasons:/thriller|mystery|crime|suspense/i.test(genre)?entries.filter(item=>/romance|romantic|consent/i.test(item.reason)):[],
    dropCapFragments:entries.filter(item=>/^f you\b|^enn Ihnen\b/i.test(item.before)||/^f you\b|^enn Ihnen\b/i.test(item.after)),
    entries,
  }
}

async function main(){
  const evidence:any[]=[]
  const carryForward:any[]=[]
  const outputDir=path.join(process.cwd(),'working','held-german-notes-remediation-2026-10-05')
  await mkdir(outputDir,{recursive:true})
  for(const job of JOBS){
    const orderResult=await db.from('orders').select('*').eq('id',job.orderId).single()
    if(orderResult.error||!orderResult.data)throw new Error(`${job.title}: order unavailable`)
    const order=orderResult.data
    if(order.book_title!==job.title||!['delivery_pending','ready_for_review'].includes(order.status)||order.completed_at!==null||JSON.stringify(order.languages)!==JSON.stringify([LANGUAGE]))throw new Error(`${job.title}: held-order preflight failed`)
    const upsells=Array.isArray(order.upsells)?order.upsells:JSON.parse(order.upsells||'[]')
    if(upsells.includes('launch-pack')!==job.launchPack)throw new Error(`${job.title}: Launch Pack entitlement changed`)
    const priorReview=await db.from('reader_panel_requests').select('*').eq('order_id',job.orderId).eq('language',LANGUAGE).in('state',['reader_review_pass','reader_review_pass_with_notes']).order('reviewed_at',{ascending:false}).limit(1).single()
    if(priorReview.error||!priorReview.data)throw new Error(`${job.title}: prior immutable build lacks reader-panel approval`)
    const previousPackage=await db.from('package_manifests').select('build_id').eq('order_id',job.orderId).eq('language',LANGUAGE).eq('build_id',priorReview.data.build_id).eq('status','pass').single()
    if(previousPackage.error||!previousPackage.data)throw new Error(`${job.title}: reader-reviewed package is not a passed immutable package`)
    const previousResult=await db.from('order_language_builds').select('id,generation,state').eq('id',priorReview.data.build_id).single()
    if(previousResult.error||!previousResult.data)throw new Error(`${job.title}: previous passed build unavailable`)
    const previous=previousResult.data
    const delivery=await db.from('delivery_events').select('id,state,attempt_count,provider_message_id,sent_at').eq('order_id',job.orderId).eq('state','pending')
    if(delivery.error||delivery.data?.some(event=>event.attempt_count!==0||event.provider_message_id||event.sent_at))throw new Error(`${job.title}: delivery is not safely held`)
    if(delivery.data?.length){
      const held=await db.from('delivery_events').update({state:'failed'}).eq('order_id',job.orderId).eq('state','pending').eq('attempt_count',0).is('provider_message_id',null).is('sent_at',null).select('id')
      if(held.error||held.data?.length!==delivery.data.length)throw new Error(`${job.title}: could not freeze pending delivery event`)
    }else{
      const historical=await db.from('delivery_events').select('state,attempt_count,provider_message_id,sent_at').eq('order_id',job.orderId)
      if(historical.error||!historical.data?.length||historical.data.some(event=>event.state!=='failed'||event.attempt_count!==0||event.provider_message_id||event.sent_at))throw new Error(`${job.title}: held delivery history changed`)
    }
    if(order.status==='delivery_pending'){
      const reopened=await db.from('orders').update({status:'ready_for_review',delivery_started_at:null,completed_at:null}).eq('id',job.orderId).eq('status','delivery_pending').is('completed_at',null).select('id').single()
      if(reopened.error||!reopened.data)throw new Error(`${job.title}: could not reopen held order for immutable rebuild`)
    }

    const sourceRow=await db.from('files').select('file_url,original_content').eq('order_id',job.orderId).eq('type','original').single()
    if(sourceRow.error||!sourceRow.data)throw new Error(`${job.title}: source unavailable`)
    const metadata=typeof sourceRow.data.original_content==='string'?JSON.parse(sourceRow.data.original_content):sourceRow.data.original_content||{}
    const source=await downloadOriginalBinary(db,sourceRow.data.file_url,metadata.sha256||null,metadata.storageBucket)
    const sourceHash=createHash('sha256').update(source).digest('hex')
    if(sourceHash!==metadata.sha256)throw new Error(`${job.title}: authoritative source hash changed`)
    const sourceDocument=await parseSemanticDocx(source,sourceHash)
    const briefRow=await db.from('translation_briefs').select('brief').eq('order_id',job.orderId).eq('language',LANGUAGE).order('revision',{ascending:false}).limit(1).single()
    if(briefRow.error||!briefRow.data?.brief)throw new Error(`${job.title}: translation brief unavailable`)
    const brief=briefRow.data.brief as TranslationBriefV1
    const seededCaches=await seedPassCaches(job.orderId,brief,sourceDocument,previous.id)
    const previousFinalArtifact=await db.from('artifacts').select('storage_bucket,storage_path,sha256').eq('order_id',job.orderId).eq('language',LANGUAGE).eq('build_id',previous.id).eq('artifact_type','final_docx').single()
    if(previousFinalArtifact.error||!previousFinalArtifact.data)throw new Error(`${job.title}: previous Final artifact unavailable`)
    const previousFinalBuffer=await downloadArtifact(previousFinalArtifact.data),previousFinalFacts=inspectDeliveredDocx(previousFinalBuffer)
    let launchPack:Buffer|undefined,reusedFinalDocx:{buffer:Buffer;expectedSha256:string}|undefined
    if(job.launchPack){
      const artifact=await db.from('artifacts').select('storage_bucket,storage_path').eq('order_id',job.orderId).eq('language',LANGUAGE).eq('build_id',previous.id).eq('artifact_type','launch_pack').single()
      if(artifact.error||!artifact.data)throw new Error(`${job.title}: purchased Launch Pack unavailable`)
      launchPack=await downloadArtifact(artifact.data)
    }
    if(job.preserveFinalSha256){
      if(previousFinalArtifact.data.sha256!==job.preserveFinalSha256)throw new Error(`${job.title}: approved Final artifact hash changed before notes-only rebuild`)
      reusedFinalDocx={buffer:previousFinalBuffer,expectedSha256:job.preserveFinalSha256}
    }
    const outputConfig={verifiedTitle:job.verifiedTitle,overrides:job.overrides,explanations:job.explanations,notes:job.notes,repairUnexpectedExplanatoryAdditions:job.title==='Never Look Back',allowPreviouslyReviewedEditorialReuse:true,preserveFinalSha256:job.preserveFinalSha256}
    const configHash=createHash('sha256').update(JSON.stringify(outputConfig)).digest('hex').slice(0,16)
    const buildId=deterministicSemanticBuildId(job.orderId,LANGUAGE,sourceHash,brief.revision,`${SEMANTIC_PROMPT_SIGNATURE}+held-german-${configHash}`)
    const result=await runSemanticPipeline({supabase:db,orderId:job.orderId,language:LANGUAGE,sourceFormat:'docx',source,title:order.book_title,verifiedTranslatedTitle:job.verifiedTitle,authorName:order.author_name,genre:order.genre,brief,notes:job.notes,customerNotesAreAuthoritative:true,buildId,verifiedEditorialOverrides:[...job.overrides],verifiedExplanatoryNotes:[...job.explanations],repairUnexpectedExplanatoryBrackets:job.title==='Never Look Back',allowPreviouslyReviewedEditorialReuse:true,reusedFinalDocx,allowReviewedStructure:order.semantic_structure_approved===true,launchPack,dualFormat:false,maxBatchConcurrency:3,translate:async(_batch,context)=>{throw new Error(`Unexpected model call: ${job.title} pass ${context.pass} batch ${context.batchIndex}`)}})
    if(result.manifest.status!=='pass')throw new Error(`${job.title}: package manifest did not pass`)
    const artifacts=await db.from('artifacts').select('*').eq('order_id',job.orderId).eq('language',LANGUAGE).eq('build_id',buildId)
    if(artifacts.error)throw new Error(`${job.title}: new artifacts unavailable`)
    const byType=new Map((artifacts.data||[]).map(artifact=>[artifact.artifact_type,artifact]))
    const finalBuffer=await downloadArtifact(byType.get('final_docx')),reviewBuffer=await downloadArtifact(byType.get('review_docx')),noteBuffer=await downloadArtifact(byType.get('translation_notes')),qaBuffer=await downloadArtifact(byType.get('qa_changelog'))
    const finalFacts=inspectDeliveredDocx(finalBuffer),reviewFacts=inspectDeliveredDocx(reviewBuffer)
    const customerNotes=await renderCustomerTranslationNotesDocx(noteBuffer,job.title,'German')
    const customerNotesFilename=`${job.title} - Notes - DE.docx`
    await writeFile(path.join(outputDir,customerNotesFilename),customerNotes)
    const explanationAudit=auditBookWideExplanatoryNotes(sourceDocument,result.pass2,brief,[...job.explanations])
    const prepSchoolNotes=result.pass2.nodes.filter((node,index)=>/\b(?:prep|preparatory) school\b/i.test(sourceDocument.nodes[index].sourceText)&&explanatorySpans(node.translatedText||'').length>0).length
    const dmvOnGunLicense=result.pass2.nodes.filter((node,index)=>/license for it in Arizona/i.test(sourceDocument.nodes[index].sourceText)&&/DMV|Kraftfahrzeugbehörde|Zulassungsstelle/i.test(node.translatedText||'')).length
    const finalText=finalFacts.acceptedText
    const approvedSourceTerms=brief.items.filter(item=>item.authorDecision==='footnote'||item.authorDecision==='convert_with_note').map(item=>item.sourceTerm)
    const customerNoteErrors=validateCustomerTranslationNotes(job.notes,{sourceTexts:sourceDocument.nodes.map(node=>node.sourceText),finalText,approvedSourceTerms,authoritativeSourceTitle:job.title})
    if(customerNoteErrors.length)throw new Error(`${job.title}: customer Notes linkage failed: ${customerNoteErrors.join('; ')}`)
    const corrections=job.overrides.map(item=>({nodeId:item.nodeId,beforeAbsent:!finalText.includes(item.before),afterPresent:finalText.includes(item.after)}))
    if(corrections.some(item=>!item.beforeAbsent||!item.afterPresent))throw new Error(`${job.title}: approved correction audit failed`)
    const generation=await db.from('order_language_builds').select('generation,state,is_current').eq('id',buildId).single()
    const finalOrder=await db.from('orders').select('status,completed_at,delivery_started_at').eq('id',job.orderId).single()
    const deliveryAfter=await db.from('delivery_events').select('state,attempt_count,provider_message_id,sent_at').eq('order_id',job.orderId)
    const highschoolForms={highschool:(finalText.match(/\bHighschool/g)||[]).length,highSchool:(finalText.match(/\bHigh[ -]School\b/gi)||[]).length,highschoolHyphenAbschluss:(finalText.match(/\bHighschool-Abschluss\b/gi)||[]).length,highschoolabschluss:(finalText.match(/\bHighschoolabschluss\b/gi)||[]).length}
    const explanationStyles=explanatorySpans(finalText).reduce((counts,item)=>({...counts,[item.style]:counts[item.style]+1}),{bracket:0,paired_dash:0,colon:0} as Record<'bracket'|'paired_dash'|'colon',number>)
    const canonicalHighschool=(finalText.match(/Highschool-Foto \(Highschool: die amerikanische Oberstufe\)/g)||[]).length
    const dmvExplanation=(finalText.match(/DMV \(US-amerikanische Kraftfahrzeugbehörde\)/g)||[]).length
    if(job.title==='Never Look Back'){
      const canonicalSentence='Ich rief Bens Highschool-Foto (Highschool: die amerikanische Oberstufe) auf meinem Handy auf.'
      const laterSentence='als er auf die Highschool ging, und er hat mich dafür gehasst.'
      if(!finalText.includes(canonicalSentence)||!finalText.includes(laterSentence)||highschoolForms.highSchool!==0||highschoolForms.highschoolHyphenAbschluss!==0||canonicalHighschool!==1||dmvExplanation!==1||explanationAudit.additionsByStyle.paired_dash!==0||prepSchoolNotes!==0||finalFacts.emptyTextTotal!==0||finalFacts.prohibitedEmptyTextRuns!==0||reviewFacts.prohibitedEmptyTextRuns!==0)throw new Error('Never Look Back: final remediation audit failed')
    }
    const noteAudit=notesAudit(noteBuffer,order.genre||'')
    if(noteAudit.identicalBeforeAfter.length||noteAudit.genreInappropriateReasons.length||noteAudit.dropCapFragments.length)throw new Error(`${job.title}: Translation Notes audit failed`)
    evidence.push({orderId:job.orderId,title:job.title,authoritativeSourceTitle:job.title,previousBuildId:previous.id,buildId,generation:generation.data,seededCaches,artifactCount:artifacts.data?.length,artifactTypes:(artifacts.data||[]).map(item=>item.artifact_type).sort(),manifestStatus:result.manifest.status,entitlements:result.manifest.entitlements,finalSha256:createHash('sha256').update(finalBuffer).digest('hex'),translationNotesSha256:createHash('sha256').update(noteBuffer).digest('hex'),customerNotesFilename,customerNotesSha256:createHash('sha256').update(customerNotes).digest('hex'),qaChangelog:{artifactType:'qa_changelog',filename:'qa-changelog.md',sha256:createHash('sha256').update(qaBuffer).digest('hex'),customerVisible:false},customerNotesValidation:{entryCount:job.notes.sections.flatMap(section=>section.entries).length,englishSourceCheck:'pass',exactFinalMatch:'pass',errors:customerNoteErrors},glued:xmlParagraphs(finalBuffer),finalWordCount:finalFacts.acceptedWordCount,reviewWordCount:reviewFacts.acceptedWordCount,wordCountDelta:reviewFacts.acceptedWordCount-finalFacts.acceptedWordCount,emptyText:{previousFinal:{total:previousFinalFacts.emptyTextTotal,prohibited:previousFinalFacts.prohibitedEmptyTextRuns},final:{total:finalFacts.emptyTextTotal,prohibited:finalFacts.prohibitedEmptyTextRuns},review:{total:reviewFacts.emptyTextTotal,prohibited:reviewFacts.prohibitedEmptyTextRuns}},highschoolForms,canonicalHighschool,dmvExplanation,explanationStyles,explanatoryNotes:explanationAudit,specialExplanatoryChecks:{prepSchoolNotes,dmvOnGunLicense},quotes:finalFacts.germanQuotes,corrections,notesReasons:reasonsFromNotes(noteBuffer),notesAudit:noteAudit,order:finalOrder.data,deliveryEvents:deliveryAfter.data})
    carryForward.push({job,priorReview:priorReview.data,buildId})
  }
  // All packages and byte audits passed before customer portal state is reopened.
  for(const item of carryForward){
    const {id:_id,created_at:_createdAt,build_id:_oldBuild,request_identity:oldIdentity,...template}=item.priorReview
    const now=new Date().toISOString(),requestIdentity=createHash('sha256').update(`${oldIdentity}:${item.buildId}:notes-remediation`).digest('hex')
    const verdictNotes=`${template.verdict_notes||''} Follow-up Notes/package remediation validated in immutable build ${item.buildId}; verdict carried forward solely for Teddy's held byte inspection.`.trim()
    const inserted=await db.from('reader_panel_requests').insert({...template,build_id:item.buildId,request_identity:requestIdentity,verdict_notes:verdictNotes,reviewed_at:now}).select('id').single()
    if(inserted.error)throw new Error(`${item.job.title}: could not carry the approved reader verdict forward: ${inserted.error.message}`)
    const gate=await db.rpc('resolve_reader_panel_gate',{p_order_id:item.job.orderId})
    if(gate.error)throw new Error(`${item.job.title}: reader gate did not reopen: ${gate.error.message}`)
    const eventKey=createHash('sha256').update(`${item.job.orderId}:${item.buildId}:held-notes-inspection`).digest('hex')
    const delivery=await db.from('delivery_events').insert({order_id:item.job.orderId,event_key:eventKey,package_builds:{de:item.buildId},state:'pending',attempt_count:0}).select('id').single()
    if(delivery.error)throw new Error(`${item.job.title}: held portal event could not be created: ${delivery.error.message}`)
    const order=await db.from('orders').update({status:'delivery_pending',delivery_started_at:now,completed_at:null}).eq('id',item.job.orderId).eq('status','ready_for_review').is('completed_at',null).select('id').single()
    if(order.error||!order.data)throw new Error(`${item.job.title}: held customer portal could not be reopened`)
  }
  const finalState=[]
  for(const item of carryForward){
    const order=await db.from('orders').select('status,completed_at,delivery_started_at').eq('id',item.job.orderId).single()
    const delivery=await db.from('delivery_events').select('state,attempt_count,provider_message_id,sent_at').eq('order_id',item.job.orderId)
    finalState.push({orderId:item.job.orderId,buildId:item.buildId,order:order.data,deliveryEvents:delivery.data})
  }
  const report={generatedAt:new Date().toISOString(),customerEmailSent:false,evidence,finalState}
  await writeFile(path.join(outputDir,'audit.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}

main().catch(error=>{console.error(error);process.exit(1)})

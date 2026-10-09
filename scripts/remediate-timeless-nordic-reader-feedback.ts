import {createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@supabase/supabase-js'
import {downloadOriginalBinary} from '../lib/source-binary'
import {parseSemanticEpub} from '../lib/semantic-parser'
import {createDeterministicSemanticBatches,semanticBatchIdentity} from '../lib/semantic-batching'
import {createNodeTranslationInput} from '../lib/node-translation-contract'
import {translationBriefFingerprint,TranslationBriefV1} from '../lib/translation-brief'
import {BOOKLINGUA_MODEL_CONFIG} from '../lib/model-config'
import {EDITORIAL_PROMPT_VERSION,TRANSLATION_PROMPT_VERSION} from '../lib/editorial-prompt'
import {deterministicSemanticBuildId,runSemanticPipeline,SEMANTIC_PROMPT_SIGNATURE,stripLeakedSourcePageMarkers} from '../lib/semantic-pipeline'
import {normalizeTypography} from '../lib/typography'
import {normalizeGermanTerminology} from '../lib/german-terminology'
import {buildReaderSampleDocx,readerSampleWordCount,selectReaderSample} from '../lib/reader-panel'
import {inspectDeliveredDocx} from '../lib/delivery-contract'

const ORDER='ca3c9c27-1910-443e-a291-771a2128a794'
const LANGUAGE='de'
const PRIOR_BUILD='5698b486-2b6f-5ac6-97f9-569a03721a47'
const VERIFIED_TITLE='Zeitlose nordische Märchen'

type Replacement={node:number;from:string;to:string;reason:string}

const replacements:Replacement[]=[
  {node:41,from:'In diesen Seiten liegt mehr als nur Geschichten; sie sind Erinnerungen an eine Lebensweise',to:'Auf diesen Seiten finden sich mehr als nur Geschichten; sie erinnern an eine Lebensweise',reason:'repairs grammar and an English structural calque'},
  {node:44,from:'war er bereits größer gewachsen als der größte Mann',to:'war er bereits größer als der größte Mann',reason:'removes an unidiomatic comparative construction'},
  {node:48,from:'der Windstoß erfasste den Herrn, blies ihn vom Dach herunter und auf den gepflasterten Hof hinab',to:'der Windstoß erfasste den Herrn und riss ihn vom Dach auf den gepflasterten Hof hinab',reason:'removes repetitive wording and restores idiomatic motion'},
  {node:51,from:'hatte er seinem Hunger gerade mal die Spitze genommen',to:'hatte er gerade einmal den größten Hunger gestillt',reason:'replaces a literal rendering with the German idiom'},
  {node:52,from:'an den Hof des Königs, der in tiefer Trauer lag',to:'an den Hof des Königs, an dem tiefe Trauer herrschte',reason:'repairs the collocation for a court in mourning'},
  {node:53,from:'dass derjenige, der seine Töchter retten könne, die Hand einer von ihnen gewinnen würde',to:'wer seine Töchter rette, solle eine von ihnen zur Frau bekommen',reason:'uses natural fairy-tale German for the promised marriage'},
  {node:66,from:'Aber am Königshof habe ich von Knös gehört.',to:'Aber ich habe von Knös am Königshof gehört.',reason:'preserves that Knös is at court rather than implying the speaker heard the news there'},
  {node:70,from:'Aber am Königshof habe ich von Knös gehört.',to:'Aber ich habe von Knös am Königshof gehört.',reason:'preserves that Knös is at court rather than implying the speaker heard the news there'},
  {node:71,from:'„Kommt mit uns.“',to:'„Komm mit uns.“',reason:'corrects plural address to the single man being invited'},
  {node:72,from:'Der zweite Mann versuchte es ebenfalls, scheiterte jedoch auch.',to:'Auch der zweite Mann versuchte es, scheiterte jedoch.',reason:'removes redundant adverbs'},
  {node:83,from:'Zu seiner großen Überraschung war nichts darin außer einem kleinen Zettel Papier. Endlich gelangte er zu einem winzigen Kästchen, und darin lag nur ein Zettel Papier.',to:'Zu seiner großen Überraschung lag darin nichts als ein kleiner Zettel.',reason:'removes an obvious duplicated source sentence and the unidiomatic phrase Zettel Papier'},
  {node:382,from:'nun müssen wir mit leeren Händen heimkehren, sehen eher aus wie Bettler denn wie Königssöhne',to:'nun müssen wir mit leeren Händen heimkehren und sehen eher wie Bettler aus als wie Königssöhne',reason:'repairs a comma splice and natural German comparison order'},
  {node:385,from:'Doch je weiter die Reise fortschritt, desto mehr erfuhren die Prinzen, dass es der Jüngling gewesen war',to:'Doch im Laufe der Reise erfuhren die Prinzen, dass es der Jüngling gewesen war',reason:'removes a malformed je-desto construction'},
  {node:386,from:'„Sagt jemandem ein Wort hiervon, und Ihr werdet ebenfalls sterben.“',to:'„Verliert jemandem gegenüber ein Wort darüber, und Ihr werdet ebenfalls sterben.“',reason:'uses the natural German threat construction'},
  {node:386,from:'Doch ihre Herzen schmerzten um den tapferen Jüngling',to:'Doch sie trauerten um den tapferen Jüngling',reason:'removes an English emotional calque'},
  {node:388,from:'Als er seine Stärke wiedererlangt hatte',to:'Als er wieder zu Kräften gekommen war',reason:'uses idiomatic German recovery wording'},
  {node:389,from:'Aus dem großen Saal erklang der Klang von Tanz und Saitenmusik.',to:'Aus dem großen Saal drangen Tanzmusik und der Klang von Saiteninstrumenten.',reason:'removes repeated Klang and the impossible sound of dancing'},
  {node:395,from:'der die Fröhlichkeit liebte',to:'der gern lachte und feierte',reason:'renders loved merriment naturally in context'},
  {node:395,from:'Der ganze Hof verstummte, betäubt von seiner schönen Erscheinung und seiner edlen Haltung. Geflüster lief durch die Menge',to:'Der ganze Hof verstummte, beeindruckt von seiner stattlichen Erscheinung und edlen Haltung. Ein Flüstern ging durch die Menge',reason:'repairs two conspicuous English collocations'},
  {node:396,from:'liefen zu ihm, warfen ihm vor Freude die Arme um den Hals',to:'liefen auf ihn zu und warfen ihm vor Freude die Arme um den Hals',reason:'repairs coordination and the motion idiom'},
  {node:397,from:'durchsuchten sie das Haar des Jünglings',to:'suchten sie im Haar des Jünglings',reason:'uses the natural verb construction for finding the rings'},
  {node:400,from:'Mit der Zeit verstarb der König',to:'Jahre später starb der König',reason:'removes a literal time-transition collocation'},
  {node:403,from:'Märchen haben eine hohe Meinung von der Macht der Musik',to:'Märchen schreiben der Musik große Macht zu',reason:'replaces a direct English calque'},
  {node:410,from:'Nils fand sich mit der feinsten und größten Menge Kohle wieder, die er je gesehen hatte',to:'am Ende besaß Nils den besten und größten Kohlevorrat, den er je gesehen hatte',reason:'replaces found himself with and the awkward quantity noun'},
  {node:422,from:'Er sattelte sein Pferd sorgfältig',to:'Er schirrte sein Pferd sorgfältig an',reason:'matches the wagon and harness described in the scene'},
  {node:423,from:'und trieb das Pferd an, so schnell wie möglich zu laufen',to:'und trieb das Pferd zu größter Eile an',reason:'removes an English infinitive construction'},
  {node:423,from:'mitten auf dem bloßen Eis zurückblieben',to:'mitten auf der offenen Eisfläche zurückblieben',reason:'uses an idiomatic description of exposed ice'},
  {node:432,from:'Hinter ihm ertönte ein Schuss der Trolle',to:'Hinter ihm krachte ein Schuss der Trolle',reason:'uses the idiomatic verb for a shot'},
  {node:433,from:'für einmal das Nachsehen',to:'ausnahmsweise das Nachsehen',reason:'uses standard German rather than a regional calque'},
  {node:446,from:'alle lärmend bemüht, das Schwein zu kaufen',to:'die alle lautstark darum wetteiferten, das Schwein zu kaufen',reason:'repairs an English participial calque'},
  {node:734,from:'wenn sie ihm erlaubten, etwas auf ihre Nacken zu schreiben',to:'wenn sie ihm erlaubten, jedem von ihnen etwas in den Nacken zu schreiben',reason:'repairs case and natural body-location wording'},
  {node:734,from:'schrieb: „Dieb und Schurke“ auf beide Nacken',to:'schrieb beiden „Dieb und Schurke“ in den Nacken',reason:'repairs case and natural body-location wording'},
  {node:743,from:'dort, auf ihre Hälse geschrieben, standen die Worte',to:'dort standen ihnen die Worte in den Nacken geschrieben',reason:'uses natural German word order and body-location wording'},
  {node:744,from:'gab ihm die Hand der jüngsten Prinzessin zur Ehe',to:'gab ihm die jüngste Prinzessin zur Frau',reason:'uses conventional fairy-tale German'},
  {node:747,from:'Motiv: Ein Vogel schenkt dem armen Jungen Waffen und Rüstung; während dies gewöhnlich durch einen Troll, ein Pferd oder den Geist eines Verstorbenen geschieht.',to:'Motiv: Ein Vogel schenkt dem armen Jungen Waffen und Rüstung, während diese Rolle gewöhnlich einem Troll, einem Pferd oder dem Geist eines Verstorbenen zufällt.',reason:'repairs the semicolon and dangling reference'},
  {node:777,from:'Dort kämpfte eine Möwe darum, mit einem Hecht in den Klauen aus dem Wasser zu fliegen.',to:'Dort versuchte eine Möwe mühsam, mit einem Hecht in den Klauen aus dem Wasser aufzufliegen.',reason:'replaces a literal struggle-to construction'},
  {node:779,from:'Sie schlug kurz mit den Flügeln, bevor sie regungslos wurde.',to:'Sie schlug noch kurz mit den Flügeln und fiel dann regungslos zu Boden.',reason:'makes the action complete and natural in German'},
  {node:783,from:'begegnete allen so freundlich',to:'behandelte alle so freundlich',reason:'uses the correct verb for treating people kindly'},
  {node:791,from:'Der Treue erzählte alles, was geschehen war, und wie er glaubte, dies sei das letzte Mal, dass er seinen treuen Gefährten sehen würde.',to:'Der Treue erzählte alles, was geschehen war, und erklärte, er glaube, seinen treuen Gefährten zum letzten Mal zu sehen.',reason:'repairs broken coordination and compresses the English construction'},
  {node:792,from:'Wenn du den Troll siehst, wie er sein Maul weit aufreißt, klettere in ihn hinein.',to:'Wenn du siehst, wie der Troll sein Maul weit aufreißt, klettere hinein.',reason:'repairs clause order and removes an awkward pronoun'},
]

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})

const normalized=(value:string)=>stripLeakedSourcePageMarkers(normalizeGermanTerminology(normalizeTypography(value,LANGUAGE)))

async function downloadArtifact(artifact:any):Promise<Buffer>{
  const result=await db.storage.from(artifact.storage_bucket).download(artifact.storage_path)
  if(result.error||!result.data)throw new Error(result.error?.message||'Artifact unavailable')
  return Buffer.from(await result.data.arrayBuffer())
}

async function seedCaches(brief:TranslationBriefV1,sourceDocument:any,storedPass1:any,storedPass2:any){
  const briefFingerprint=translationBriefFingerprint(brief)
  const pass1Nodes=storedPass1.nodes.map((node:any,index:number)=>({...node,sourceText:sourceDocument.nodes[index].sourceText,translatedText:normalized(node.translatedText||'')}))
  const outputs=[
    {pass:1 as const,authoritative:sourceDocument.nodes,output:pass1Nodes,model:BOOKLINGUA_MODEL_CONFIG.translation,prompt:TRANSLATION_PROMPT_VERSION},
    {pass:2 as const,authoritative:pass1Nodes,output:storedPass2.nodes,model:BOOKLINGUA_MODEL_CONFIG.editorial,prompt:EDITORIAL_PROMPT_VERSION},
  ]
  let count=0
  for(const item of outputs){
    const batches=createDeterministicSemanticBatches(item.authoritative)
    const documentFingerprint=createNodeTranslationInput(item.authoritative).sourceFingerprint
    const byId=new Map(item.output.map((node:any)=>[node.id,node]))
    for(const batch of batches){
      const request=createNodeTranslationInput(batch.nodes,item.pass===2)
      const nodes=batch.nodes.map(node=>{
        const prior:any=byId.get(node.id)
        if(!prior?.translatedText?.trim())throw new Error(`Missing cached translation for ${node.id}`)
        return{id:node.id,text:prior.translatedText}
      })
      const structure=semanticBatchIdentity({orderId:ORDER,language:LANGUAGE,documentFingerprint,pass:item.pass,orderedNodeIds:batch.orderedNodeIds,briefRevision:brief.revision,briefFingerprint,modelId:item.model,schemaVersion:request.schemaVersion,promptVersion:item.prompt})
      const content=JSON.stringify({schemaVersion:request.schemaVersion,sourceFingerprint:request.sourceFingerprint,nodes})
      const saved=await db.from('translation_chunks').upsert({order_id:ORDER,lang_code:LANGUAGE,chunk_index:batch.index,pass:`semantic-pass${item.pass}`,content,pipeline_version:'semantic-v2',schema_version:request.schemaVersion,structure_fingerprint:structure,model_provider:BOOKLINGUA_MODEL_CONFIG.provider,model_id:item.model,model_stage:item.pass===1?'translation':'editorial'},{onConflict:'order_id,lang_code,chunk_index,pass,pipeline_version,schema_version,structure_fingerprint,model_id'})
      if(saved.error)throw new Error(saved.error.message)
      count++
    }
  }
  return count
}

async function main(){
  const orderResult=await db.from('orders').select('*').eq('id',ORDER).single()
  if(orderResult.error||!orderResult.data)throw new Error('Order unavailable')
  const order=orderResult.data
  if(!['reader_review_pending','ready_for_review'].includes(order.status)||order.completed_at)throw new Error(`Order is not safely held: ${order.status}`)
  const sourceRow=await db.from('files').select('file_url,original_content').eq('order_id',ORDER).eq('type','original').single()
  if(sourceRow.error||!sourceRow.data)throw new Error('Source unavailable')
  const metadata=typeof sourceRow.data.original_content==='string'?JSON.parse(sourceRow.data.original_content):sourceRow.data.original_content||{}
  const source=await downloadOriginalBinary(db,sourceRow.data.file_url,metadata.sha256||null,metadata.storageBucket)
  const sourceHash=createHash('sha256').update(source).digest('hex')
  const sourceDocument=parseSemanticEpub(source,sourceHash)
  const documents=await db.from('semantic_documents').select('pass,document').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',PRIOR_BUILD).in('pass',['pass1','pass2'])
  if(documents.error)throw new Error(documents.error.message)
  const storedPass1=documents.data?.find(row=>row.pass==='pass1')?.document
  const storedPass2=documents.data?.find(row=>row.pass==='pass2')?.document
  if(!storedPass1||!storedPass2)throw new Error('Prior semantic documents unavailable')
  if(sourceDocument.nodes.length!==storedPass2.nodes.length)throw new Error('Parser node count changed')
  const briefResult=await db.from('translation_briefs').select('brief').eq('order_id',ORDER).eq('language',LANGUAGE).order('revision',{ascending:false}).limit(1).single()
  if(briefResult.error||!briefResult.data?.brief)throw new Error('Translation brief unavailable')
  const brief=briefResult.data.brief as TranslationBriefV1
  const seededCaches=await seedCaches(brief,sourceDocument,storedPass1,storedPass2)

  const grouped=new Map<number,Replacement[]>()
  for(const item of replacements)grouped.set(item.node,[...(grouped.get(item.node)||[]),item])
  const overrides=[] as Array<{nodeId:string;before:string;after:string}>
  const corrections=[] as Array<{node:number;reason:string;before:string;after:string}>
  for(const [index,items] of Array.from(grouped)){
    const before=normalized(storedPass2.nodes[index].translatedText||'')
    let after=before
    for(const item of items){
      const count=after.split(item.from).length-1
      if(count!==1)throw new Error(`Replacement mismatch at node ${index}: ${item.from} (${count})`)
      after=after.replace(item.from,item.to)
      corrections.push({node:index,reason:item.reason,before:item.from,after:item.to})
    }
    overrides.push({nodeId:storedPass2.nodes[index].id,before,after})
  }
  const configHash=createHash('sha256').update(JSON.stringify({overrides,version:'reader-feedback-notes-v2'})).digest('hex').slice(0,16)
  const buildId=deterministicSemanticBuildId(ORDER,LANGUAGE,sourceHash,brief.revision,`${SEMANTIC_PROMPT_SIGNATURE}+timeless-reader-feedback-${configHash}`)
  const notes={schemaVersion:'1.0' as const,language:LANGUAGE,approach:'The editorial review preserved the traditional fairy-tale voice while producing natural, idiomatic German.',sections:[{id:'representative-decisions',title:'Representative Editorial Decisions',entries:[
    {source:'Timeless Nordic Fairy Tales',target:VERIFIED_TITLE,reason:'The German title preserves the original title’s clear promise of enduring Nordic folk stories.'},
    {source:'The king declared that whoever could save his daughters would win the hand of one of them.',target:'Der König erklärte, wer seine Töchter rette, solle eine von ihnen zur Frau bekommen.',reason:'This uses natural fairy-tale German while preserving the king’s offer exactly.'},
    {source:'The message pleased the king, who loved merriment, and he ordered the youth to be welcomed as an honored guest.',target:'Die Botschaft gefiel dem König, der gern lachte und feierte, und er befahl, den Jüngling als Ehrengast willkommen zu heißen.',reason:'This expresses “loved merriment” idiomatically while retaining the king’s cheerful character.'},
  ]}]}
  const result=await runSemanticPipeline({supabase:db,orderId:ORDER,language:LANGUAGE,sourceFormat:'epub',source,title:order.book_title,verifiedTranslatedTitle:VERIFIED_TITLE,authorName:order.author_name,genre:order.genre,brief,notes,customerNotesAreAuthoritative:true,buildId,verifiedEditorialOverrides:overrides,allowPreviouslyReviewedEditorialReuse:true,dualFormat:true,maxBatchConcurrency:3,translate:async(_batch,context)=>{throw new Error(`Unexpected model call: pass ${context.pass}, batch ${context.batchIndex}`)}})
  if(result.manifest.status!=='pass')throw new Error('Rebuilt package did not pass')
  const artifacts=await db.from('artifacts').select('*').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',buildId)
  if(artifacts.error)throw new Error(artifacts.error.message)
  const finalArtifact=artifacts.data?.find(item=>item.artifact_type==='final_docx')
  const epubArtifact=artifacts.data?.find(item=>item.artifact_type==='final_epub')
  if(!finalArtifact||!epubArtifact)throw new Error('Final artifacts missing')
  const finalDocx=await downloadArtifact(finalArtifact),finalEpub=await downloadArtifact(epubArtifact)
  const facts=inspectDeliveredDocx(finalDocx)
  const pageMarkers=facts.acceptedText.match(/\[\d{1,4}\]/g)||[]
  const entities=facts.acceptedText.match(/&(?:quot|apos|amp|lt|gt|#\d+|#x[0-9a-f]+);/gi)||[]
  if(pageMarkers.length||entities.length)throw new Error(`Final residue: ${pageMarkers.length} page markers, ${entities.length} entities`)
  const sampleSections=selectReaderSample(result.pass2)
  const sample=await buildReaderSampleDocx({document:result.pass2,translatedTitle:VERIFIED_TITLE,language:LANGUAGE,sections:sampleSections})
  const outputDir=path.join(process.cwd(),'working','timeless-nordic-reader-remediation-2026-10-09')
  await mkdir(outputDir,{recursive:true})
  await writeFile(path.join(outputDir,'Timeless Nordic Fairy Tales - German - Final.docx'),finalDocx)
  await writeFile(path.join(outputDir,'Timeless Nordic Fairy Tales - German - Final.epub'),finalEpub)
  await writeFile(path.join(outputDir,'Timeless Nordic Fairy Tales - German - Reader Sample QA.docx'),sample)
  const report={generatedAt:new Date().toISOString(),orderId:ORDER,priorBuildId:PRIOR_BUILD,buildId,packageStatus:result.manifest.status,seededCaches,customerEmailSent:false,orderStatus:order.status,readerSampleWordCount:readerSampleWordCount(sampleSections),correctionCount:corrections.length+3,correctedNodes:new Set([...corrections.map(item=>item.node),375,377,379]).size,pageMarkersRemoved:['[181]','[182]','[183]'],finalAudit:{pageMarkers:pageMarkers.length,visibleEntities:entities.length,wordCount:facts.acceptedWordCount},duplicateFinding:{node:83,sourceAlsoDuplicated:true,action:'Collapsed the obvious repeated source sentence into one natural German sentence.'},corrections,artifacts:(artifacts.data||[]).map(item=>({type:item.artifact_type,sha256:item.sha256,filename:item.filename}))}
  await writeFile(path.join(outputDir,'audit.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}

main().catch(error=>{console.error(error);process.exit(1)})

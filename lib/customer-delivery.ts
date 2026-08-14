import { PackageArtifact, PackageManifestV1, evaluatePackageManifest } from './package-manifest'

export const CUSTOMER_DELIVERY_TEMPLATE_VERSION = '2.0'

export const CUSTOMER_ARTIFACT_TYPES = [
  'final_docx', 'final_epub', 'review_docx', 'chapter_map_docx', 'translation_notes', 'launch_pack',
] as const

export type CustomerArtifactType = typeof CUSTOMER_ARTIFACT_TYPES[number]

const LANGUAGE_CODES: Record<string,string> = {
  fr:'FR', de:'DE', es:'ES', 'es-es':'ES', 'es-latam':'ES', it:'IT', pt:'PT', 'pt-pt':'PT', 'pt-br':'PT',
}

const LANGUAGE_NAMES: Record<string,string> = {
  fr:'French', de:'German', es:'Spanish', 'es-es':'Spanish (Spain)', 'es-latam':'Spanish (Latin America)',
  it:'Italian', pt:'Portuguese', 'pt-pt':'Portuguese (Portugal)', 'pt-br':'Portuguese (Brazil)',
}

const PRESENTATION: Record<CustomerArtifactType,{label:string;fileType:string;description:string}> = {
  final_docx:{label:'Final Translation — Word',fileType:'Final',description:'Your clean, editable translated manuscript.'},
  final_epub:{label:'Final Translation — EPUB',fileType:'Final',description:'Your translated ebook file, ready for final checking and upload.'},
  review_docx:{label:'Translation Review',fileType:'Review',description:'See the changes made during BookLingua’s review pass.'},
  chapter_map_docx:{label:'Chapter Map',fileType:'Chapters',description:'Match chapters in your English manuscript to the translated edition.'},
  translation_notes:{label:'Translation Notes',fileType:'Notes',description:'Useful notes and decisions from the translation process.'},
  launch_pack:{label:'Launch Pack',fileType:'Launch Pack',description:'Launch and marketing material prepared for the target-language market.'},
}

export function customerLanguageCode(language:string):string{return LANGUAGE_CODES[language]||language.toUpperCase()}
export function customerLanguageName(language:string):string{return LANGUAGE_NAMES[language]||language}

export function sanitizeCustomerFilenamePart(value:string):string{
  const cleaned=value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').trim()
  return (cleaned||'BookLingua Translation').slice(0,120).trim()
}

function artifactExtension(artifact:PackageArtifact):string{
  const match=artifact.filename.match(/\.([A-Za-z0-9]+)$/)
  if(match)return match[1].toLowerCase()
  if(artifact.type==='translation_notes')return 'txt'
  if(artifact.type==='launch_pack')return 'json'
  throw new Error(`Customer artifact extension unavailable for ${artifact.type}`)
}

export function customerArtifactFilename(bookTitle:string,language:string,artifact:PackageArtifact):string{
  if(!CUSTOMER_ARTIFACT_TYPES.includes(artifact.type as CustomerArtifactType))throw new Error(`Internal artifact cannot receive a customer filename: ${artifact.type}`)
  const config=PRESENTATION[artifact.type as CustomerArtifactType]
  return `${sanitizeCustomerFilenamePart(bookTitle)} - ${config.fileType} - ${customerLanguageCode(language)}.${artifactExtension(artifact)}`
}

export function customerContentDisposition(filename:string):string{
  const safe=sanitizeCustomerFilenamePart(filename.replace(/\.[^.]+$/,'')), extension=filename.match(/\.[A-Za-z0-9]+$/)?.[0]||''
  const readable=`${safe}${extension}`
  const ascii=readable.normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/["\\]/g,'_')||`BookLingua${extension}`
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(readable)}`
}

export interface CustomerArtifactPresentation {artifact:PackageArtifact;type:CustomerArtifactType;label:string;description:string;filename:string}

export function customerVisibleArtifacts(bookTitle:string,manifest:PackageManifestV1):CustomerArtifactPresentation[]{
  const evaluated=evaluatePackageManifest(manifest)
  if(evaluated.status!=='pass')throw new Error('Customer package is not validated')
  return evaluated.artifacts.filter((artifact):artifact is PackageArtifact & {type:CustomerArtifactType}=>CUSTOMER_ARTIFACT_TYPES.includes(artifact.type as CustomerArtifactType))
    .sort((a,b)=>CUSTOMER_ARTIFACT_TYPES.indexOf(a.type)-CUSTOMER_ARTIFACT_TYPES.indexOf(b.type))
    .map(artifact=>({...PRESENTATION[artifact.type],artifact,type:artifact.type,filename:customerArtifactFilename(bookTitle,manifest.language,artifact)}))
}

export function resolveCustomerDeliveryOrigin(value=process.env.NEXT_PUBLIC_APP_URL,environment=process.env.HARDENED_EXTERNAL_DELIVERY==='enabled'?'production':process.env.BOOKLINGUA_DELIVERY_ENV||process.env.NODE_ENV):string{
  if(!value)throw new Error('Customer delivery origin is not configured')
  let url:URL
  try{url=new URL(value)}catch{throw new Error('Customer delivery origin is invalid')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Customer delivery origin must be a bare HTTP(S) origin')
  const loopback=['localhost','127.0.0.1','::1'].includes(url.hostname)
  if(environment==='production'&&(url.protocol!=='https:'||loopback))throw new Error('Production customer delivery requires a public HTTPS origin')
  return url.origin
}

export function customerDeliveryAllowed(recipient:string):{allowed:boolean;mode:'production'|'staging'|'disabled'}{
  if(process.env.HARDENED_EXTERNAL_DELIVERY==='enabled')return{allowed:true,mode:'production'}
  const stagingRecipient=process.env.BOOKLINGUA_STAGING_DELIVERY_RECIPIENT?.trim().toLowerCase()
  if(process.env.BOOKLINGUA_DELIVERY_ENV==='staging'&&stagingRecipient&&recipient.trim().toLowerCase()===stagingRecipient)return{allowed:true,mode:'staging'}
  return{allowed:false,mode:'disabled'}
}

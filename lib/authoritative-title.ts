import AdmZip from 'adm-zip'
import { SemanticDocumentV2 } from './semantic-document'

export type TitleSourceKind = 'semantic_title_node' | 'epub_metadata' | 'docx_metadata' | 'checkout_metadata' | 'preserved_original'

export interface TitleAuthority {
  sourceKind: TitleSourceKind
  sourceValue: string
  translatedValue?: string
  effectiveValue: string
  confidence: 'verified' | 'preserved'
  fallbackUsed: boolean
  semanticNodeId?: string
  warning?: { code: 'TITLE_TRANSLATION_UNAVAILABLE'; message: string }
}

function decodeXml(value:string):string{
  return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim()
}

function normalize(value:string):string{
  return value.normalize('NFKC').replace(/[‘’‛]/g,"'").toLocaleLowerCase().replace(/[^\w\u00c0-\u024f]+/g,' ').replace(/\s+/g,' ').trim()
}

export function cleanBookTitle(value:string):string{
  return decodeXml(value).replace(/^\s*(?:updated\s+)?(?:e-?book|ebook|final|revised|latest)(?:\s+(?:file|version|edition))?\s*[-_:–—]*\s*/i,'').trim()||decodeXml(value)
}

function subtitleBase(value:string):string|null{
  const match=value.match(/^(.*?)(?:\s+[—–|]\s+|:\s+|\s+-\s+).+$/)
  return match?.[1]?.trim()||null
}

function isVerifiedSemanticTitle(sourceText:string,checkoutTitle:string):boolean{
  const source=normalize(sourceText),checkout=normalize(checkoutTitle)
  if(!source||!checkout)return false
  if(source===checkout)return true
  const base=subtitleBase(sourceText)
  return Boolean(base&&normalize(base)===checkout)
}

export function extractSourceMetadataTitle(source:Buffer,format:SemanticDocumentV2['sourceFormat']):{kind:TitleSourceKind;value:string}|null{
  if(format==='txt')return null
  try{
    const zip:any=new AdmZip(source)
    if(format==='epub'){
      for(const entry of zip.getEntries().filter((candidate:any)=>/\.opf$/i.test(candidate.entryName))){
        const match=entry.getData().toString('utf8').match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)
        if(match&&decodeXml(match[1]))return{kind:'epub_metadata',value:decodeXml(match[1])}
      }
    }
    if(format==='docx'){
      const entry=zip.getEntry('docProps/core.xml'),match=entry?.getData().toString('utf8').match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)
      if(match&&decodeXml(match[1]))return{kind:'docx_metadata',value:decodeXml(match[1])}
    }
  }catch{}
  return null
}

export function resolveTitleAuthority(input:{document:SemanticDocumentV2;checkoutTitle:string;source:Buffer}):TitleAuthority{
  const checkoutTitle=cleanBookTitle(input.checkoutTitle)
  const semantic=input.document.nodes.find(node=>node.type==='heading'&&Boolean(node.translatedText?.trim())&&isVerifiedSemanticTitle(node.sourceText,checkoutTitle))
  if(semantic?.translatedText)return{
    sourceKind:'semantic_title_node',sourceValue:semantic.sourceText,translatedValue:semantic.translatedText.trim(),effectiveValue:semantic.translatedText.trim(),
    confidence:'verified',fallbackUsed:false,semanticNodeId:semantic.id,
  }
  const metadata=extractSourceMetadataTitle(input.source,input.document.sourceFormat)
  const sourceValue=cleanBookTitle(metadata?.value||checkoutTitle)
  return{
    sourceKind:metadata?.kind||'checkout_metadata',sourceValue,effectiveValue:sourceValue,confidence:'preserved',fallbackUsed:true,
    warning:{code:'TITLE_TRANSLATION_UNAVAILABLE',message:'No verified translated title authority was available; the original title was preserved for review.'},
  }
}

function replaceTrailingTitlePhrase(text:string,canonical:string):string|null{
  const words=text.match(/[\w\u00c0-\u024f’'’-]+|[^\w\u00c0-\u024f’'’-]+/g)||[]
  const connectors=new Set(['a','à','au','aux','da','de','del','della','der','des','di','do','dos','du','of','the','van','von','zu','zur'])
  let end=words.length-1
  while(end>=0&&!/[\w\u00c0-\u024f]/.test(words[end]))end--
  if(end<0)return null
  let start=end,meaningful=0
  for(let i=end;i>=0;i--){
    const token=words[i]
    if(!/[\w\u00c0-\u024f]/.test(token))continue
    const plain=token.replace(/[’'’-]/g,''),first=plain.charAt(0)
    const isUpper=first&&first===first.toLocaleUpperCase()&&first!==first.toLocaleLowerCase()
    if(isUpper||connectors.has(plain.toLocaleLowerCase())){start=i;if(!connectors.has(plain.toLocaleLowerCase()))meaningful++;continue}
    break
  }
  return meaningful<2?null:`${words.slice(0,start).join('')}${canonical}${words.slice(end+1).join('')}`
}

export function applyTitleAuthority(document:SemanticDocumentV2,checkoutTitle:string,authority:TitleAuthority):{document:SemanticDocumentV2;changedNodeIds:string[]}{
  if(!authority.translatedValue)return{document,changedNodeIds:[]}
  const title=authority.translatedValue,changedNodeIds:string[]=[]
  const nodes=document.nodes.map(node=>{
    if(!node.translatedText)return node
    const exactTitleNode=node.id===authority.semanticNodeId
    const explicitTitleReference=node.sourceText.includes(checkoutTitle)
    if(!exactTitleNode&&!explicitTitleReference)return node
    let translated=node.translatedText
    if(exactTitleNode)translated=title
    else if(translated.includes(checkoutTitle))translated=translated.replaceAll(checkoutTitle,title)
    else if(!normalize(translated).includes(normalize(title))){
      const replaced=replaceTrailingTitlePhrase(translated,title)
      if(!replaced)return node
      translated=replaced
    }
    if(translated!==node.translatedText)changedNodeIds.push(node.id)
    return{...node,translatedText:translated}
  })
  return{document:{...document,nodes},changedNodeIds}
}

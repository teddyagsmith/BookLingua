import { SemanticDocumentV2 } from './semantic-document'

function normalize(value:string):string{return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\w\u00c0-\u024f]+/g,' ').trim()}

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
    const plain=token.replace(/[’'’-]/g,'')
    const first=plain.charAt(0),isUpper=first&&first===first.toLocaleUpperCase()&&first!==first.toLocaleLowerCase()
    if(isUpper||connectors.has(plain.toLocaleLowerCase())){start=i;if(!connectors.has(plain.toLocaleLowerCase()))meaningful++;continue}
    break
  }
  if(meaningful<2)return null
  return `${words.slice(0,start).join('')}${canonical}${words.slice(end+1).join('')}`
}

export function authoritativeTranslatedTitle(document:SemanticDocumentV2,sourceTitle:string):string{
  const exact=document.nodes.find(node=>normalize(node.sourceText)===normalize(sourceTitle)&&node.translatedText?.trim())
  if(!exact?.translatedText)throw new Error('Authoritative translated title is unavailable')
  return exact.translatedText.trim()
}

export function enforceAuthoritativeTranslatedTitle(document:SemanticDocumentV2,sourceTitle:string):{document:SemanticDocumentV2;title:string;changedNodeIds:string[]}{
  const title=authoritativeTranslatedTitle(document,sourceTitle),changedNodeIds:string[]=[]
  const nodes=document.nodes.map(node=>{
    const exactTitleNode=normalize(node.sourceText)===normalize(sourceTitle)
    const explicitTitleReference=node.sourceText.includes(sourceTitle)
    if(!node.translatedText||(!exactTitleNode&&!explicitTitleReference))return node
    let translated=node.translatedText
    if(exactTitleNode)translated=title
    else if(translated.includes(sourceTitle))translated=translated.replaceAll(sourceTitle,title)
    else if(!normalize(translated).includes(normalize(title))){
      const replaced=replaceTrailingTitlePhrase(translated,title)
      if(!replaced)throw new Error(`Unable to enforce authoritative title in ${node.id}`)
      translated=replaced
    }
    if(translated!==node.translatedText)changedNodeIds.push(node.id)
    return{...node,translatedText:translated}
  })
  return{document:{...document,nodes},title,changedNodeIds}
}

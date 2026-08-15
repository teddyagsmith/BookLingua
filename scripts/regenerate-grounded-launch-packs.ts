import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { generateLaunchStrategy, toCanonicalLaunchPack } from '../lib/launch-strategy'

const root=process.argv[2]
if(!root)throw new Error('inspection root required')
const authoritative=path.join(root,'authoritative')
const manuscriptFacts=`Authoritative title: Bride of the Hollow King. Author: T.S. Everly. Genre supplied by the order: romantasy. Grounded premise from the authoritative manuscript and approved product brief: an adult dark/gothic romantasy involving a ruined wedding dress, a forgotten fiancé, a dangerous fae king, a cursed court, a memory mystery, and forced/arranged-marriage tension. Authoritative recurring proper names visible in the completed manuscript include Shayla Ashbourne, Caelan, Greymere, Hollow Court, Blackthorn Wood and Thorn Throne. Do not add any deadline, countdown, quotation, spice rating, content warning, event, relationship, setting or worldbuilding fact beyond this list. Promotional copy may be original, but must never be presented as a quotation from the book.`

async function run(locale:'fr'|'de',dossierPath:string){
  const dossier=await readFile(dossierPath,'utf8')
  let metadata:any
  const strategy=await generateLaunchStrategy({
    bookTitle:'Bride of the Hollow King',authorName:'T.S. Everly',genre:'romantasy',
    bookDescription:manuscriptFacts,manuscriptFacts,researchDossier:dossier,
    targetLanguage:locale==='fr'?'French':'German',targetMarket:locale==='fr'?'France':'Germany',
  },{requestId:`9d43f5f1:${locale}:grounded-launch-v4`,onMetadata:value=>{metadata=value}})
  const pack=toCanonicalLaunchPack(strategy,locale,true)
  const serialized=JSON.stringify(pack,null,2)
  const forbidden=[/thirteen nights/i,/highest[- ]saved/i,/highest[- ]upside/i,/major income line/i,/reciprocate strongly/i]
  const hit=forbidden.find(pattern=>pattern.test(serialized))
  if(hit)throw new Error(`${locale} pack contains unsupported claim: ${hit}`)
  await writeFile(path.join(authoritative,`${locale}-launch_pack.json`),serialized)
  await writeFile(path.join(authoritative,`${locale}-launch_pack-grounded-v4.json`),serialized)
  return {locale,metadata,opportunities:pack.opportunities.length,sources:pack.research.sources.length}
}

const french=path.join(root,'french-launch-research-dossier.md')
const german=path.join(process.cwd(),'scripts','german-launch-research-dossier.md')
Promise.all([run('fr',french),run('de',german)]).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1})

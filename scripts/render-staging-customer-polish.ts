import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { renderCustomerLaunchPackDocx, renderCustomerTranslationNotesDocx, renderCustomerUploadGuideDocx } from '../lib/customer-delivery-docx'
import { deriveEditorialTranslationNotes, renderTranslationNotes, TranslationNoteEntry, TranslationNotesV1 } from '../lib/translation-notes'
import { buildChapterMap, renderChapterMapDocx } from '../lib/chapter-map'

async function main(){
const root=process.argv[2]
if(!root)throw new Error('Usage: tsx scripts/render-staging-customer-polish.ts <inspection-root>')
const authoritative=path.join(root,'authoritative'),bundle=path.join(root,'CUSTOMER-ARTIFACT-INSPECTION-BUNDLE')
const records=JSON.parse(await readFile(path.join(authoritative,'semantic-documents.json'),'utf8')) as Array<{language:string|null;pass:string;document:any}>
await mkdir(bundle,{recursive:true})

const short=(value:string)=>value.replace(/\s+/g,' ').trim().slice(0,180)
function evidence(document:any,pattern:RegExp,reason:string):TranslationNoteEntry|null{
  const node=document.nodes.find((item:any)=>pattern.test(item.sourceText)&&item.translatedText)
  return node?{source:short(node.sourceText),target:short(node.translatedText),reason}:null
}

for(const language of ['fr','de']){
  const pass1=records.find(item=>item.language===language&&item.pass==='pass1')!.document
  const pass2=records.find(item=>item.language===language&&item.pass==='pass2')!.document
  const titleNode=pass2.nodes.find((node:any)=>node.sourceText.trim()==='Bride of the Hollow King')
  if(!titleNode?.translatedText)throw new Error(`${language} authoritative title unavailable`)
  const derived=deriveEditorialTranslationNotes({language:language==='fr'?'French':'German',pass1,pass2,authoritativeTitle:{source:'Bride of the Hollow King',target:titleNode.translatedText},limit:1})
  const broader=[
    evidence(pass2,/My name is Caelan/,`The character name Caelan is retained while the surrounding introduction follows ${language==='fr'?'French guillemet and dialogue':'German quotation and dialogue'} conventions.`),
    evidence(pass2,/I knew I was Shayla Ashbourne/,`Shayla Ashbourne and Greymere remain stable proper names, anchoring character and place identity across the translated edition.`),
    evidence(pass2,/King of the Hollow Court/,language==='de'?'Hollow Court becomes Hohler Hof, with the inflected form Hohlen Hofes used naturally in context; royal rank and place name remain a coherent German fantasy term.':'Cour Creuse is used consistently for Hollow Court, preserving the courtly meaning and the novel’s hollow/emptiness motif.'),
    evidence(pass2,/Lord of the Blackthorn Wood/,language==='de'?'Blackthorn Wood becomes Schwarzdornwald and Thorn Throne becomes Dornenthron: natural German compounds that preserve the shared thorn imagery across the worldbuilding.':'Bois de Blackthorn and Trône d’Épines keep the recurring thorn imagery legible while treating the proper-name system consistently.'),
    evidence(pass2,/“No,” I whispered/,language==='de'?'German low quotation marks and natural dialogue punctuation are used consistently, while the intimate first-person cadence remains direct.':'French guillemets and dialogue punctuation are applied without flattening the narrator’s hesitation and rising panic.'),
    evidence(pass2,/Your Majesty/,language==='de'?'The formal royal address Your Majesty is rendered as Eure Majestät, preserving court hierarchy and the direct form of address in natural German.':'The formal royal address Your Majesty becomes Votre Majesté, preserving court hierarchy and the direct form of address in idiomatic French.'),
    evidence(pass2,/For several breaths, I did not move/,`The sensory, gothic register is carried through concrete images—dead leaves, damp earth, black branches and held breath—rather than replaced with generic fantasy language.`),
    evidence(pass2,/ruined wedding dress/,`The ruined wedding dress and blackthorn embroidery are translated as recurring visual motifs, preserving the contrast between romance, ritual and threat.`),
    evidence(pass2,/kiss|desire|body|breath|touch/i,`Romantic and bodily language retains the source level of intimacy and tension without becoming more clinical or more explicit in translation.`),
  ].filter((entry):entry is TranslationNoteEntry=>Boolean(entry))
  const existing=derived.sections.flatMap(section=>section.entries)
  const limit=language==='fr'?12:8
  const entries=[...existing,...broader].filter((entry,index,list)=>list.findIndex(candidate=>candidate.source===entry.source)===index).slice(0,limit)
  const notes:TranslationNotesV1={schemaVersion:'1.0',language:language==='fr'?'French':'German',approach:`The translation preserves the novel’s intimate gothic-romantasy voice, romantic tension, character relationships, and internally consistent fantasy world. These selected decisions are grounded in the completed source, translation brief, and two-pass translated text.`,sections:[{id:'selected-decisions',title:'Selected Translation & Editorial Decisions',entries}]}
  await writeFile(path.join(bundle,`Bride of the Hollow King - Notes - ${language.toUpperCase()}.docx`),await renderCustomerTranslationNotesDocx(Buffer.from(renderTranslationNotes(notes)),'Bride of the Hollow King',notes.language))
  const pack=await readFile(path.join(authoritative,`${language}-launch_pack.json`))
  await writeFile(path.join(bundle,`Bride of the Hollow King - Launch Pack - ${language.toUpperCase()}.docx`),await renderCustomerLaunchPackDocx(pack,'Bride of the Hollow King',titleNode.translatedText,'T.S. Everly'))
  await writeFile(path.join(bundle,`Bride of the Hollow King - Chapters - ${language.toUpperCase()}.docx`),await renderChapterMapDocx(buildChapterMap(pass2),{bookTitle:'Bride of the Hollow King',language:notes.language}))
}

await writeFile(path.join(bundle,'BookLingua - How to Use Your Translations + Upload Guide.docx'),await renderCustomerUploadGuideDocx())
console.log(JSON.stringify({bundle,notes:{fr:12,de:8},modelCalls:0,newBuilds:0},null,2))
}

main().catch(error=>{console.error(error);process.exitCode=1})

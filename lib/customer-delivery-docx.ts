import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { deterministicDocx } from './deterministic-docx'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'
import { BOOKLINGUA_CLEAN_BOOK_STYLE } from './formatting-policy'

function heading(text:string,level:typeof HeadingLevel[keyof typeof HeadingLevel]=HeadingLevel.HEADING_1){return new Paragraph({text,heading:level})}
function paragraph(text:string){return new Paragraph({children:[new TextRun(text)],spacing:{after:120,line:276}})}
function bullet(text:string){return new Paragraph({children:[new TextRun(text)],bullet:{level:0},spacing:{after:100,line:276}})}

async function pack(children:Paragraph[]):Promise<Buffer>{
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles:{default:{document:{run:{font:BOOKLINGUA_CLEAN_BOOK_STYLE.bodyFont,size:BOOKLINGUA_CLEAN_BOOK_STYLE.bodySizeHalfPoints}}}},
    sections:[{properties:{page:{margin:BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips}},children}],
  }))))
}

export async function renderCustomerLaunchPackDocx(bytes:Buffer,bookTitle:string):Promise<Buffer>{
  let launchPack:LaunchPackV1
  try{launchPack=JSON.parse(bytes.toString('utf8')) as LaunchPackV1}catch{throw new Error('Launch Pack structured data is malformed')}
  const errors=validateLaunchPack({pack:launchPack,expectedLocale:launchPack.locale,purchased:true})
  if(errors.length)throw new Error(errors.join('; '))
  return pack([
    heading(`${bookTitle} — Launch Pack`,HeadingLevel.TITLE),
    paragraph(`${launchPack.language} • ${launchPack.market} • ${launchPack.amazonDomain}`),
    heading('Book Description'),paragraph(launchPack.bookDescription),
    heading('Amazon Backend Keywords'),...launchPack.backendKeywords.map(bullet),
    heading('Advertising Keywords'),...launchPack.adKeywords.map(bullet),
    heading('Suggested Categories'),...launchPack.categories.map(bullet),
    heading('Pricing Recommendation'),
    paragraph(`Ebook: ${launchPack.pricingRecommendation.ebook}`),
    paragraph(`Paperback: ${launchPack.pricingRecommendation.paperback}`),
    paragraph(launchPack.pricingRecommendation.reasoning),
    heading('Review Strategy'),...launchPack.reviewStrategy.map(bullet),
    heading('KDP Upload Checklist'),...launchPack.kdpUploadChecklist.map(bullet),
  ])
}

export async function renderCustomerTranslationNotesDocx(bytes:Buffer,bookTitle:string,language:string):Promise<Buffer>{
  const lines=bytes.toString('utf8').split(/\r?\n/).map(line=>line.trim())
  const meaningful=lines.filter(Boolean)
  if(meaningful.length<2)throw new Error('Translation Notes are too sparse for customer delivery')
  const children:Paragraph[]=[heading(`${bookTitle} — Translation Notes`,HeadingLevel.TITLE),paragraph(language)]
  let sawEntry=false
  for(const line of meaningful){
    if(/^Translation Notes\s+[—-]/i.test(line))continue
    if(/^Reason:/i.test(line)){children.push(new Paragraph({children:[new TextRun({text:line,italics:true,color:'555555'})],spacing:{after:160}}));continue}
    if(line.includes('→')){children.push(bullet(line));sawEntry=true;continue}
    if(children.length===2)children.push(paragraph(line))
    else children.push(heading(line,HeadingLevel.HEADING_1))
  }
  if(!sawEntry)throw new Error('Translation Notes contain no customer-facing decisions')
  return pack(children)
}

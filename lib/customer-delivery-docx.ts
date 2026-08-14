import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { deterministicDocx } from './deterministic-docx'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'
import { BOOKLINGUA_CLEAN_BOOK_STYLE } from './formatting-policy'

const PURPLE='6D28D9',DARK='312E81',LAVENDER='F3E8FF',PALE='FAF7FF',GRAY='4B5563',BORDER='DDD6FE'
const body=(text:string,options:{bold?:boolean;italics?:boolean;color?:string;size?:number}={})=>new TextRun({text,font:'Aptos',size:options.size||22,bold:options.bold,italics:options.italics,color:options.color||'1F2937'})
const paragraph=(text:string,options:{after?:number;before?:number;alignment?:typeof AlignmentType[keyof typeof AlignmentType];bold?:boolean;italics?:boolean;color?:string}={})=>new Paragraph({alignment:options.alignment,children:[body(text,options)],spacing:{before:options.before||0,after:options.after??140,line:300}})
const heading=(text:string,level:typeof HeadingLevel[keyof typeof HeadingLevel]=HeadingLevel.HEADING_1,pageBreakBefore=false)=>new Paragraph({heading:level,pageBreakBefore,children:[body(text,{bold:true,color:level===HeadingLevel.TITLE?DARK:PURPLE,size:level===HeadingLevel.TITLE?38:28})],spacing:{before:level===HeadingLevel.TITLE?0:280,after:140}})
const bullet=(text:string)=>new Paragraph({children:[body(text)],bullet:{level:0},spacing:{after:100,line:286}})
const numbered=(text:string,index:number)=>new Paragraph({children:[body(`${index + 1}. `,{bold:true,color:PURPLE}),body(text)],spacing:{after:120,line:286},indent:{left:240,hanging:240}})
const cell=(children:Paragraph[],options:{fill?:string;width?:number;columnSpan?:number}={})=>new TableCell({columnSpan:options.columnSpan,shading:options.fill?{fill:options.fill,type:ShadingType.CLEAR}:undefined,width:options.width?{size:options.width,type:WidthType.DXA}:undefined,margins:{top:120,bottom:120,left:140,right:140},children})
const table=(rows:TableRow[],columnWidths:number[])=>new Table({rows,width:{size:columnWidths.reduce((sum,value)=>sum+value,0),type:WidthType.DXA},columnWidths,layout:TableLayoutType.FIXED,borders:{top:{style:BorderStyle.SINGLE,size:2,color:BORDER},bottom:{style:BorderStyle.SINGLE,size:2,color:BORDER},left:{style:BorderStyle.SINGLE,size:2,color:BORDER},right:{style:BorderStyle.SINGLE,size:2,color:BORDER},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:BORDER},insideVertical:{style:BorderStyle.SINGLE,size:1,color:BORDER}}})

const brandLine=()=>new Paragraph({children:[body('BOOK',{bold:true,color:DARK,size:28}),body('LINGUA',{bold:true,color:PURPLE,size:28})],spacing:{after:220}})
const footer=()=>new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[body('BookLingua · Translate your book in hours, not months',{color:'6B7280',size:18}),body('   ·   ',{color:'9CA3AF',size:18}),new TextRun({children:[PageNumber.CURRENT],color:'6B7280',size:18})]})]})

async function pack(children:(Paragraph|Table)[],withFooter=false):Promise<Buffer>{
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles:{default:{document:{run:{font:'Aptos',size:22},paragraph:{spacing:{line:300}}}}},
    sections:[{properties:{page:{margin:BOOKLINGUA_CLEAN_BOOK_STYLE.pageMarginsTwips}},footers:withFooter?{default:footer()}:undefined,children}],
  }))))
}

export function extractAuthoritativeTranslatedTitle(bytes:Buffer,bookTitle:string):string|null{
  const lines=bytes.toString('utf8').split(/\r?\n/)
  for(let index=0;index<lines.length;index++){
    const arrow=lines[index].match(/^(.*?)\s*→\s*(.+)$/)
    const reason=lines[index+1]||''
    if(arrow&&(arrow[1].trim()===bookTitle||/authoritative translated book title/i.test(reason)))return arrow[2].trim()
  }
  return null
}

export async function renderCustomerLaunchPackDocx(bytes:Buffer,bookTitle:string,translatedTitle?:string):Promise<Buffer>{
  let launchPack:LaunchPackV1
  try{launchPack=JSON.parse(bytes.toString('utf8')) as LaunchPackV1}catch{throw new Error('Launch Pack structured data is malformed')}
  const errors=validateLaunchPack({pack:launchPack,expectedLocale:launchPack.locale,purchased:true})
  if(errors.length)throw new Error(errors.join('; '))
  const title=translatedTitle?.trim()||bookTitle
  const marketLine=`${launchPack.market} · ${launchPack.amazonDomain}`
  const descriptionBox=table([new TableRow({children:[cell([
    paragraph('READY TO COPY INTO YOUR AMAZON LISTING',{bold:true,color:PURPLE,after:120}),
    paragraph(launchPack.bookDescription,{after:40}),
  ],{fill:PALE,width:9000})]})],[9000])
  const keywordRows=launchPack.backendKeywords.map((keyword,index)=>new TableRow({children:[cell([paragraph(String(index+1),{bold:true,color:PURPLE,alignment:AlignmentType.CENTER,after:0})],{fill:LAVENDER,width:700}),cell([paragraph(keyword,{after:0})],{width:8300})]}))
  const adColumns=['Genre & positioning','Themes & tropes','Reader searches']
  const adGroups=adColumns.map((_,column)=>launchPack.adKeywords.filter((__,index)=>index%3===column))
  const adRows=[new TableRow({tableHeader:true,children:adColumns.map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:3000}))}),...Array.from({length:Math.max(...adGroups.map(group=>group.length))},(_,row)=>new TableRow({children:adGroups.map(group=>cell([paragraph(group[row]||'',{after:0})],{width:3000}))}))]
  const categoryRows=[new TableRow({tableHeader:true,children:['Priority','Suggested category'].map((label,index)=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:index?7600:1400}))}),...launchPack.categories.map((category,index)=>new TableRow({children:[cell([paragraph(String(index+1),{bold:true,color:PURPLE,alignment:AlignmentType.CENTER,after:0})],{width:1400}),cell([paragraph(category,{after:0})],{width:7600})]}))]
  const pricingRows=[new TableRow({tableHeader:true,children:['Format','Recommended launch price'].map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:4500}))}),new TableRow({children:[cell([paragraph('Ebook',{bold:true,after:0})]),cell([paragraph(launchPack.pricingRecommendation.ebook,{bold:true,color:PURPLE,after:0})])]}),new TableRow({children:[cell([paragraph('Paperback',{bold:true,after:0})]),cell([paragraph(launchPack.pricingRecommendation.paperback,{bold:true,color:PURPLE,after:0})])]})]
  return pack([
    brandLine(),paragraph(`YOUR ${launchPack.language.toUpperCase()} LAUNCH PACK`,{bold:true,color:PURPLE,after:260}),heading(title,HeadingLevel.TITLE),paragraph(marketLine,{color:GRAY,after:260}),paragraph(`Everything you need to position, list and launch your translated book in ${launchPack.market}.`,{after:300}),
    heading('Book Description',HeadingLevel.HEADING_1,true),descriptionBox,
    heading('Amazon Keywords'),paragraph('Seven backend keyword fields, ready to copy into your listing.',{color:GRAY}),table(keywordRows,[700,8300]),
    heading('Advertising Keywords'),paragraph('Validated search terms grouped for easier campaign setup.',{color:GRAY}),table(adRows,[3000,3000,3000]),
    heading('Suggested Categories'),table(categoryRows,[1400,7600]),
    heading('Pricing'),table(pricingRows,[4500,4500]),paragraph(launchPack.pricingRecommendation.reasoning,{italics:true,color:GRAY,before:140}),
    heading('Reviews & Launch Strategy'),...launchPack.reviewStrategy.map(numbered),
    heading('KDP Upload Checklist'),...launchPack.kdpUploadChecklist.map(numbered),
  ],true)
}

export async function renderCustomerTranslationNotesDocx(bytes:Buffer,bookTitle:string,language:string):Promise<Buffer>{
  const lines=bytes.toString('utf8').split(/\r?\n/).map(line=>line.trim())
  const meaningful=lines.filter(Boolean)
  if(meaningful.length<2)throw new Error('Translation Notes are too sparse for customer delivery')
  const translatedTitle=extractAuthoritativeTranslatedTitle(bytes,bookTitle)||bookTitle
  const children:(Paragraph|Table)[]=[brandLine(),heading('Translation Notes',HeadingLevel.TITLE),heading(translatedTitle,HeadingLevel.HEADING_1),paragraph(`${language} Translation`,{italics:true,color:GRAY,after:260})]
  let sawEntry=false,sectionSeen=false
  for(let index=0;index<meaningful.length;index++){
    const line=meaningful[index]
    if(/^Translation Notes\s+[—-]/i.test(line))continue
    if(/^Reason:/i.test(line))continue
    if(line.includes('→')){
      const [source,...targetParts]=line.split('→'),reason=meaningful[index+1]?.replace(/^Reason:\s*/i,'')||''
      children.push(table([new TableRow({children:[cell([paragraph('SOURCE MEANING / PHRASE',{bold:true,color:PURPLE,after:80}),paragraph(source.trim(),{after:0})],{fill:PALE,width:4500}),cell([paragraph('FINAL TRANSLATED CHOICE',{bold:true,color:PURPLE,after:80}),paragraph(targetParts.join('→').trim(),{after:0})],{fill:PALE,width:4500})]}),new TableRow({children:[cell([paragraph('WHY WE CHOSE IT',{bold:true,color:DARK,after:70}),paragraph(reason,{after:0})],{width:9000,columnSpan:2})]})],[4500,4500]))
      children.push(paragraph('',{after:100}));sawEntry=true;index++;continue
    }
    if(!sectionSeen){children.push(paragraph(line,{after:220}));sectionSeen=true}
    else children.push(heading(line,HeadingLevel.HEADING_1))
  }
  if(!sawEntry)throw new Error('Translation Notes contain no customer-facing decisions')
  return pack(children,true)
}

export async function renderCustomerUploadGuideDocx():Promise<Buffer>{
  const section=(title:string,intro:string,items:string[])=>[heading(title),paragraph(intro),...items.map(bullet)]
  return pack([
    brandLine(),paragraph('START HERE',{bold:true,color:PURPLE,after:180}),heading('How to Use Your Translations + Upload Guide',HeadingLevel.TITLE),paragraph('A practical guide to reviewing your BookLingua files and preparing your translated book for publishing.',{color:GRAY,after:300}),
    ...section('What BookLingua has delivered','Your package contains clean publishing files, a transparent editorial review, navigation aids, translation insight, and target-market launch material.',[]),
    ...section('Your Final files','These contain the clean, reviewed translation and are the files you would normally work from and publish.', ['Final DOCX — editable manuscript for review, formatting, or print workflows.','Final EPUB — ebook package for final checking and upload.']),
    ...section('Your Review file','This lets you see what changed during BookLingua’s editorial pass.', ['Yellow highlighting marks reviewed passages.','Struck-through text is the initial translation; the following highlighted text is the reviewed wording.','Your Final files already contain the accepted reviewed wording.']),
    ...section('Your Chapters file','The Chapter Map matches the original book structure to the translated edition. Keep it beside your Final file when navigating, editing, or uploading your book.',[]),
    ...section('Your Translation Notes','These explain meaningful decisions involving voice, terminology, localisation, dialogue, romance, and editorial judgement.',[]),
    ...section('Your Launch Pack','Your target-market publishing and marketing pack includes:', ['Translated book description','Keywords and suggested categories','Pricing guidance','Review and launch recommendations','KDP upload checklist']),
    ...section('Before you publish','Your preferences still matter. Automated validation does not replace your final publishing review.', ['Read and review your Final translation.','Make any personal or preference edits you want.','Check title, author name, description, categories, pricing, and other metadata.','Preview the complete book on your publishing platform before publishing.']),
    ...section('Uploading your translated book','Use the Final EPUB for ebook upload where supported. Use the Final DOCX when you need an editable manuscript or a print-layout starting point. Follow your platform’s preview and metadata checks before publishing.',[]),
    ...section('Need help?','Email hello@booklingua.io and the BookLingua team will help.',[]),
  ],true)
}

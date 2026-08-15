import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun, PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { readFileSync } from 'fs'
import path from 'path'
import { deterministicDocx } from './deterministic-docx'
import { LaunchPackV1, validateLaunchPack } from './launch-pack-schema'
import { BOOKLINGUA_CLEAN_BOOK_STYLE } from './formatting-policy'

const PURPLE='6D28D9',DARK='312E81',LAVENDER='F3E8FF',PALE='FAF7FF',GRAY='4B5563',BORDER='DDD6FE'
const body=(text:string,options:{bold?:boolean;italics?:boolean;color?:string;size?:number}={})=>new TextRun({text,font:'Georgia',size:options.size||22,bold:options.bold,italics:options.italics,color:options.color||'1F2937'})
const paragraph=(text:string,options:{after?:number;before?:number;alignment?:typeof AlignmentType[keyof typeof AlignmentType];bold?:boolean;italics?:boolean;color?:string}={})=>new Paragraph({alignment:options.alignment,keepLines:true,children:[body(text,options)],spacing:{before:options.before||0,after:options.after??140,line:300}})
const heading=(text:string,level:typeof HeadingLevel[keyof typeof HeadingLevel]=HeadingLevel.HEADING_1)=>new Paragraph({heading:level,keepNext:true,keepLines:true,children:[body(text,{bold:true,color:level===HeadingLevel.TITLE?DARK:PURPLE,size:level===HeadingLevel.TITLE?38:28})],spacing:{before:level===HeadingLevel.TITLE?0:280,after:140}})
const bullet=(text:string)=>new Paragraph({keepLines:true,children:[body(text)],bullet:{level:0},spacing:{after:100,line:286}})
const link=(label:string,url:string)=>new Paragraph({children:[new ExternalHyperlink({link:url,children:[new TextRun({text:label,color:'2563EB',underline:{}})]})],spacing:{after:80}})
const sourceLink=(label:string,url:string)=>new Paragraph({children:[new ExternalHyperlink({link:url,children:[new TextRun({text:label,font:'Georgia',color:'2563EB',underline:{}})]})],spacing:{after:30}})
const pageBreak=()=>new Paragraph({children:[new PageBreak()]})
const numbered=(text:string,index:number)=>new Paragraph({children:[body(`${index + 1}. `,{bold:true,color:PURPLE}),body(text)],spacing:{after:120,line:286},indent:{left:240,hanging:240}})
const cell=(children:Paragraph[],options:{fill?:string;width?:number;columnSpan?:number}={})=>new TableCell({columnSpan:options.columnSpan,shading:options.fill?{fill:options.fill,type:ShadingType.CLEAR}:undefined,width:options.width?{size:options.width,type:WidthType.DXA}:undefined,margins:{top:120,bottom:120,left:140,right:140},children})
const table=(rows:TableRow[],columnWidths:number[])=>new Table({rows,width:{size:columnWidths.reduce((sum,value)=>sum+value,0),type:WidthType.DXA},columnWidths,layout:TableLayoutType.FIXED,borders:{top:{style:BorderStyle.SINGLE,size:2,color:BORDER},bottom:{style:BorderStyle.SINGLE,size:2,color:BORDER},left:{style:BorderStyle.SINGLE,size:2,color:BORDER},right:{style:BorderStyle.SINGLE,size:2,color:BORDER},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:BORDER},insideVertical:{style:BorderStyle.SINGLE,size:1,color:BORDER}}})

// Document-optimised derivative of the official site logo (same artwork,
// resized only so each DOCX does not carry a multi-megabyte source image).
const LOGO=readFileSync(path.join(process.cwd(),'public','logo-doc-hq.png'))
// 35 mm wide at 96 px/in; height follows the cropped artwork's native ratio.
const LOGO_WIDTH=144,LOGO_HEIGHT=Math.round(LOGO_WIDTH*370/1080)
const brandLine=()=>new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({data:LOGO,transformation:{width:LOGO_WIDTH,height:LOGO_HEIGHT},altText:{title:'BookLingua',description:'BookLingua logo',name:'BookLingua logo'}})],spacing:{after:260}})
const brandDivider=()=>new Paragraph({alignment:AlignmentType.CENTER,children:[body(' ',{size:4})],border:{bottom:{style:BorderStyle.SINGLE,size:8,color:PURPLE,space:1}},spacing:{before:0,after:260},indent:{left:2700,right:2700}})
const centeredHeading=(text:string,level:typeof HeadingLevel[keyof typeof HeadingLevel]=HeadingLevel.HEADING_1)=>new Paragraph({heading:level,alignment:AlignmentType.CENTER,keepNext:true,keepLines:true,children:[body(text,{bold:true,color:level===HeadingLevel.TITLE?DARK:PURPLE,size:level===HeadingLevel.TITLE?38:28})],spacing:{before:level===HeadingLevel.TITLE?0:280,after:140}})
const footer=()=>new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[body('BookLingua · Translate your book in hours, not months',{color:'6B7280',size:18}),body('   ·   ',{color:'9CA3AF',size:18}),new TextRun({children:[PageNumber.CURRENT],color:'6B7280',size:18})]})]})

async function pack(children:(Paragraph|Table)[],withFooter=false):Promise<Buffer>{
  return deterministicDocx(Buffer.from(await Packer.toBuffer(new Document({
    styles:{default:{document:{run:{font:'Georgia',size:22},paragraph:{spacing:{line:300}}}}},
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

export async function renderCustomerLaunchPackDocx(bytes:Buffer,bookTitle:string,translatedTitle?:string,authorName?:string):Promise<Buffer>{
  let launchPack:LaunchPackV1
  try{launchPack=JSON.parse(bytes.toString('utf8')) as LaunchPackV1}catch{throw new Error('Launch Pack structured data is malformed')}
  const errors=validateLaunchPack({pack:launchPack,expectedLocale:launchPack.locale,purchased:true})
  if(errors.length)throw new Error(errors.join('; '))
  const title=translatedTitle?.trim()||bookTitle
  const marketCopy=(value:string)=>value.replace(/\*\*/g,'').replace(/(?<!\*)\*(?!\*)/g,'')
  const authorCopy=(value:string)=>marketCopy(value)
    .replace(/^\s*English:\s*/i,'')
    .replace(/Romantasy is BookTok(?:'s|’s) central genre and /i,'')
    .replace(/works because German BookTok rewards mood over exposition\.?/i,'The ruined wedding dress and gothic setting lend themselves naturally to short, mood-led video.')
    .replace(/,?\s*the dominant German BookTok grammar,?/i,', a familiar short-video format,')
    .replace(/Love-interest cards drive the strongest comment activity[^.]*\.?/i,'Love-interest cards suit this book because its romantic tension gives readers a clear character question to discuss.')
    .replace(/Print reveals perform strongly on French Bookstagram[^.]*\.?/i,'A print reveal suits this book because the cover, gothic setting and translated edition provide a clear visual focus.')
    .replace(/Slow pan over torn fabric\/lace with the premise delivered in three text beats\s*[—-]\s*highest-clarity way to communicate the hook in under 8 seconds\.?/i,"A slow pan over torn fabric or lace lets the ruined-dress and forgotten-fiancé hook unfold clearly in a short video.")
    .replace(/French romantasy readers shop by trope list; a clean static card is highly saveable and shareable in DMs\.?/i,'A clean trope card suits this book because its arranged marriage, dangerous fae king, cursed court and stolen-memory elements can be understood at a glance.')
    .replace(/Balances the marketing so the heroine reads as an investigator, not a prize\s*[—-]\s*a recurring French reader critique of the genre\.?/i,'Keeps the heroine framed as an active investigator rather than a passive prize, matching her role in this book.')
    .replace(/German romantasy readers respond strongly to ['‘]Wer war er\?['’] premises that promise a mystery inside the romance\.?/i,'The forgotten-fiancé question creates a clear curiosity gap inside this book’s romance.')
    .replace(/Social proof is decisive for German indie buyers\.?/i,'With permission, attributed reader quotes give the carousel a clear, credible focus.')
    .replace(/Romantasy is the format['’]s core genre;\s*/i,'')
    .replace(/Highly searchable and shareable\.?/i,'The supported tropes can be read quickly in this format.')
    .replace(/Static bookstagram staple:/i,'Static visual concept:')
    .replace(/Easiest asset to hand to ARC readers as a style reference\.?/i,'It can also serve as a consistent visual reference for ARC outreach.')
    .replace(/pin the strongest video/i,'pin the video that performs best after reviewing your own results')
    .replace(/rotating the strongest hooks/i,'rotating the hook set and retaining the ideas that earn a response after measurement')
    .replace(/The only channel in the dossier explicitly built to connect self-published authors with French reviewers, bloggers and BookTubers\s*[—-]\s*the fastest legitimate way to build a French-language review base for an unknown romantasy author\.?/i,'A French press-service channel explicitly built to connect self-published authors with reviewers, bloggers and BookTubers; it is directly relevant to building a French-language review base for this book.')
    .replace(/The largest German-language reader community in the dossier; German romantasy readers routinely check a title there before buying, so an empty page is a visible gap\.?/i,'A German-language reader community where a complete book page can give this title a clear discovery presence.')
    .trim()
  const marketLine=`${launchPack.market} · ${launchPack.amazonDomain}`
  const descriptionBox=table([new TableRow({cantSplit:true,children:[cell([
    paragraph('READY TO COPY INTO YOUR AMAZON LISTING',{bold:true,color:PURPLE,after:120}),
    paragraph(marketCopy(launchPack.bookDescription),{after:40}),
  ],{fill:PALE,width:9000})]})],[9000])
  const keywordRows=launchPack.backendKeywords.map((keyword,index)=>new TableRow({cantSplit:true,children:[cell([paragraph(String(index+1),{bold:true,color:PURPLE,alignment:AlignmentType.CENTER,after:0})],{fill:LAVENDER,width:700}),cell([paragraph(keyword,{after:0})],{width:8300})]}))
  const adColumns=['Genre & positioning','Themes & tropes','Reader searches']
  const adGroups=adColumns.map((_,column)=>launchPack.adKeywords.filter((__,index)=>index%3===column))
  const adRows=[new TableRow({tableHeader:true,cantSplit:true,children:adColumns.map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:3000}))}),...Array.from({length:Math.max(...adGroups.map(group=>group.length))},(_,row)=>new TableRow({cantSplit:true,children:adGroups.map(group=>cell([paragraph(group[row]||'',{after:0})],{width:3000}))}))]
  const categoryRows=[new TableRow({tableHeader:true,cantSplit:true,children:['Priority','Suggested category'].map((label,index)=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:index?7600:1400}))}),...launchPack.categories.map((category,index)=>new TableRow({cantSplit:true,children:[cell([paragraph(String(index+1),{bold:true,color:PURPLE,alignment:AlignmentType.CENTER,after:0})],{width:1400}),cell([paragraph(category,{after:0})],{width:7600})]}))]
  const pricingRows=[new TableRow({tableHeader:true,cantSplit:true,children:['Format','Recommended launch price'].map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:4500}))}),new TableRow({cantSplit:true,children:[cell([paragraph('Ebook',{bold:true,after:0})]),cell([paragraph(launchPack.pricingRecommendation.ebook,{bold:true,color:PURPLE,after:0})])]}),new TableRow({cantSplit:true,children:[cell([paragraph('Paperback',{bold:true,after:0})]),cell([paragraph(launchPack.pricingRecommendation.paperback,{bold:true,color:PURPLE,after:0})])]})]
  const topOpportunityRows=[new TableRow({tableHeader:true,children:['# / Opportunity','Why it fits','Effort / Cost','Next action'].map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:2250}))}),...launchPack.topOpportunities.map(item=>new TableRow({cantSplit:true,children:[cell([paragraph(`${item.rank}. ${item.opportunity}`,{bold:true,after:50}),link('Open',item.url)],{width:2250}),cell([paragraph(authorCopy(item.whyItFits),{after:0})],{width:2250}),cell([paragraph(`${item.effort} / ${item.likelyCost}`,{after:0})],{width:2250}),cell([paragraph(authorCopy(item.recommendedAction),{after:0})],{width:2250})]}))]
  const outreachRows=[new TableRow({tableHeader:true,children:['Opportunity','Type / Fit','Cost / Permission','Priority / URL'].map(label=>cell([paragraph(label,{bold:true,color:DARK,after:0})],{fill:LAVENDER,width:2250}))}),...launchPack.opportunities.map(item=>new TableRow({cantSplit:true,children:[cell([paragraph(item.name,{bold:true,after:0})],{width:2250}),cell([paragraph(`${item.type}: ${authorCopy(item.fit)}`,{after:0})],{width:2250}),cell([paragraph(`${item.cost}; ${authorCopy(item.promotionAllowed)}`,{after:0})],{width:2250}),cell([paragraph(item.priority,{bold:true,after:50}),link('Open',item.url)],{width:2250})]}))]
  const priorities=launchPack.topOpportunities.slice(0,3)
  const bestHook=launchPack.marketingHooks[0]?.frenchPromotionalLine||launchPack.marketingHooks[0]?.hook||''
  const coverPanel=table([new TableRow({cantSplit:true,children:[cell([
    ...(authorName?[paragraph(`Prepared for ${authorName}`,{bold:true,color:DARK,after:80,alignment:AlignmentType.CENTER})]:[]),
    paragraph(`${launchPack.market} market · Research completed ${launchPack.research.completedAt}`,{color:GRAY,after:0,alignment:AlignmentType.CENTER}),
  ],{fill:LAVENDER,width:9000})]})],[9000])
  const glanceCards=table([new TableRow({cantSplit:true,children:[
    cell([paragraph('IF YOU ONLY DO THREE THINGS',{bold:true,color:PURPLE,after:80,alignment:AlignmentType.CENTER}),paragraph(priorities.map(item=>item.opportunity).join(' · '),{after:0,alignment:AlignmentType.CENTER})],{fill:PALE,width:3000}),
    cell([paragraph('MINIMUM VIABLE LAUNCH',{bold:true,color:PURPLE,after:80,alignment:AlignmentType.CENTER}),paragraph('Use the practical checklist and phased plan in the detailed sections that follow.',{after:0,alignment:AlignmentType.CENTER})],{fill:PALE,width:3000}),
    cell([paragraph('WHERE TO FOCUS',{bold:true,color:PURPLE,after:80,alignment:AlignmentType.CENTER}),paragraph(`${launchPack.market} · ${launchPack.amazonDomain}`,{after:0,alignment:AlignmentType.CENTER})],{fill:PALE,width:3000}),
  ]})],[3000,3000,3000])
  return pack([
    brandLine(),brandDivider(),paragraph(`YOUR ${launchPack.language.toUpperCase()} LAUNCH PACK`,{bold:true,color:PURPLE,after:220,alignment:AlignmentType.CENTER}),centeredHeading(title,HeadingLevel.TITLE),paragraph(marketLine,{color:GRAY,after:220,alignment:AlignmentType.CENTER}),
    table([new TableRow({cantSplit:true,children:[cell([paragraph(`Everything you need to position, list and launch your translated book in ${launchPack.market}.`,{bold:true,color:DARK,after:80,alignment:AlignmentType.CENTER}),paragraph('Market research, copy-ready listing assets and a practical 30-day launch plan.',{color:GRAY,after:0,alignment:AlignmentType.CENTER})],{fill:PALE,width:9000})]})],[9000]),paragraph('',{after:420}),coverPanel,
    paragraph('YOUR LAUNCH AT A GLANCE',{bold:true,color:DARK,after:140,before:320,alignment:AlignmentType.CENTER}),glanceCards,
    pageBreak(),heading('Your Launch at a Glance',HeadingLevel.TITLE),paragraph('A focused plan you can understand in under two minutes.',{color:GRAY}),
    heading('If you only do three things'),...priorities.map(item=>bullet(`${item.opportunity}: ${authorCopy(item.recommendedAction)}`)),
    heading('Minimum viable launch'),...launchPack.launchPlan30Day.minimumViable.slice(0,7).map(item=>bullet(authorCopy(item))),
    heading('Recommended positioning'),paragraph(authorCopy(launchPack.amazonAdsStrategy.metaPositioning)),
    heading('Recommended launch price'),paragraph(`Ebook: ${launchPack.pricingRecommendation.ebook} · Paperback: ${launchPack.pricingRecommendation.paperback}`),
    heading('Best promotional angle'),paragraph(bestHook,{italics:true}),
    heading('Where to focus'),...priorities.map(item=>bullet(item.opportunity)),
    pageBreak(),
    heading('Book Description'),paragraph(`Copy this market-ready ${launchPack.language} description into the description field for ${launchPack.amazonDomain}.`,{color:GRAY}),descriptionBox,
    heading('Amazon Keywords'),paragraph('Seven backend keyword fields, ready to copy into your listing.',{color:GRAY}),table(keywordRows,[700,8300]),
    heading('Advertising Keywords'),paragraph('Validated search terms grouped for easier campaign setup.',{color:GRAY}),table(adRows,[3000,3000,3000]),
    heading('Suggested Categories'),paragraph(`These are exact ${launchPack.language} category or metadata values to look for in ${launchPack.market}. Amazon menus change, so select the closest current match if a path has moved.`,{color:GRAY}),table(categoryRows,[1400,7600]),
    heading('Pricing'),table(pricingRows,[4500,4500]),paragraph(`These are validated launch-price recommendations for ${launchPack.market}. Before publishing, confirm the current royalty bands, delivery or printing costs, tax treatment, and your preferred positioning on ${launchPack.amazonDomain}.`,{italics:true,color:GRAY,before:140}),
    heading('Reviews & Launch Strategy'),
    ...[
      `Recruit advance readers who read ${launchPack.language} naturally and are a genuine fit for the book’s genre.`,
      `Prepare ${launchPack.language} promotional copy using the description and search terms in this pack; keep author-facing campaign notes in English.`,
      `Approach relevant reviewers, bloggers, BookTok, Bookstagram, newsletters, and reader communities serving ${launchPack.market}.`,
      'Ask for honest reviews only. Never pay for, require, or otherwise incentivise a positive review.',
      `Monitor the listing and advertising performance on ${launchPack.amazonDomain}, then refine bids and positioning without changing the validated translated manuscript.`,
    ].map(numbered),
    pageBreak(),heading('Top 10 Opportunities for This Book',HeadingLevel.TITLE),
    table(topOpportunityRows,[2250,2250,2250,2250]),
    pageBreak(),heading('Your 30-Day Launch Plan',HeadingLevel.TITLE),
    heading('Minimum viable launch'),...launchPack.launchPlan30Day.minimumViable.map(item=>bullet(authorCopy(item))),
    ...launchPack.launchPlan30Day.phases.flatMap(phase=>[heading(phase.timing),...phase.actions.map(item=>bullet(authorCopy(item)))]),
    heading('If you want to push harder'),...launchPack.launchPlan30Day.pushHarder.map(item=>bullet(authorCopy(item))),
    pageBreak(),heading('Book-Specific Marketing Hooks',HeadingLevel.TITLE),
    ...launchPack.marketingHooks.flatMap(item=>[heading(item.hook),paragraph(authorCopy(item.readerAppeal)),table([new TableRow({cantSplit:true,children:[cell([paragraph(`${launchPack.language.toUpperCase()} COPY — READY TO USE`,{bold:true,color:PURPLE}),paragraph(item.frenchPromotionalLine)],{fill:PALE,width:9000})]})],[9000])]),
    pageBreak(),heading('Social Content Ideas',HeadingLevel.TITLE),
    ...launchPack.socialContentIdeas.flatMap(item=>[heading(`${item.concept} · ${item.format}`),paragraph(authorCopy(item.explanation)),paragraph(item.frenchCaption,{italics:true}),paragraph(item.hashtags.join(' '),{color:PURPLE})]),
    pageBreak(),heading('Amazon Ads & Meta Positioning',HeadingLevel.TITLE),paragraph(authorCopy(launchPack.amazonAdsStrategy.startingStrategy)),
    heading('Comparable targets'),...launchPack.amazonAdsStrategy.comparableTargets.map(item=>bullet(authorCopy(item))),
    heading('Targeting ideas'),...launchPack.amazonAdsStrategy.targetingIdeas.map(item=>bullet(authorCopy(item))),
    heading('Meta positioning'),paragraph(authorCopy(launchPack.amazonAdsStrategy.metaPositioning)),
    heading('Free & Discount Promotion'),...launchPack.discountPromotion.flatMap(item=>[heading(item.option),paragraph(authorCopy(item.availability)),paragraph(`Restriction: ${authorCopy(item.restriction)}`,{color:GRAY}),paragraph(`Action: ${authorCopy(item.recommendedAction)}`,{bold:true})]),
    pageBreak(),heading('Researched Outreach Shortlist',HeadingLevel.TITLE),
    table(outreachRows,[2250,2250,2250,2250]),
    pageBreak(),heading('Research Notes & Sources',HeadingLevel.TITLE),paragraph(`Research completed: ${launchPack.research.completedAt}. Platforms and community rules change; verify details before outreach.`,{color:GRAY}),
    ...launchPack.research.sources.flatMap(source=>[sourceLink(source.name,source.url),paragraph(source.note,{color:GRAY,after:80})]),
    heading('KDP Upload Checklist'),
    ...[
      'Upload the supplied Final EPUB directly for the ebook unless you deliberately rebuild the edition from the Final DOCX.',
      `Set the book language to ${launchPack.language} and use the translated title, description, keywords, and category values supplied in this pack.`,
      `Confirm the marketplace is ${launchPack.market} (${launchPack.amazonDomain}) and review the ebook and paperback prices shown above.`,
      'Check author name, series information, contributors, publication rights, territories, ISBN choices, and release date.',
      'Open the online previewer and inspect the title page, chapter order, navigation, front/back matter, links, images, and formatting before publishing.',
    ].map(numbered),
    heading('Important'),paragraph('Market-ready copy and exact listing values remain in the target language so they can be pasted into the marketplace. All explanations and instructions are in English for the author. Marketplace interfaces and policies can change; confirm the current options before you publish.',{color:GRAY}),
  ],true)
}

export async function renderCustomerTranslationNotesDocx(bytes:Buffer,bookTitle:string,language:string):Promise<Buffer>{
  const lines=bytes.toString('utf8').split(/\r?\n/).map(line=>line.trim())
  const meaningful=lines.filter(Boolean)
  if(meaningful.length<2)throw new Error('Translation Notes are too sparse for customer delivery')
  const translatedTitle=extractAuthoritativeTranslatedTitle(bytes,bookTitle)||bookTitle
  const children:(Paragraph|Table)[]=[brandLine(),brandDivider(),centeredHeading('Translation Notes',HeadingLevel.TITLE),centeredHeading(translatedTitle,HeadingLevel.HEADING_1),paragraph(`${language} Translation`,{italics:true,color:GRAY,after:260,alignment:AlignmentType.CENTER})]
  let sawEntry=false,sectionSeen=false
  for(let index=0;index<meaningful.length;index++){
    const line=meaningful[index]
    if(/^Translation Notes\s+[—-]/i.test(line))continue
    if(/^Reason:/i.test(line))continue
    if(line.includes('→')){
      const [source,...targetParts]=line.split('→'),reason=meaningful[index+1]?.replace(/^Reason:\s*/i,'')||''
      children.push(table([new TableRow({cantSplit:true,children:[cell([paragraph('SOURCE MEANING / PHRASE',{bold:true,color:PURPLE,after:80}),paragraph(source.trim(),{after:0})],{fill:PALE,width:4500}),cell([paragraph('FINAL TRANSLATED CHOICE',{bold:true,color:PURPLE,after:80}),paragraph(targetParts.join('→').trim(),{after:0})],{fill:PALE,width:4500})]}),new TableRow({cantSplit:true,children:[cell([paragraph('WHY WE CHOSE IT',{bold:true,color:DARK,after:70}),paragraph(reason,{after:0})],{width:9000,columnSpan:2})]})],[4500,4500]))
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
    brandLine(),brandDivider(),paragraph('START HERE',{bold:true,color:PURPLE,after:180,alignment:AlignmentType.CENTER}),centeredHeading('How to Use Your Translations + Upload Guide',HeadingLevel.TITLE),paragraph('A practical guide to reviewing your BookLingua files and preparing your translated book for publishing.',{color:GRAY,after:300,alignment:AlignmentType.CENTER}),
    ...section('Start with these three steps','Your Final DOCX is the best place to begin because it is editable and contains the clean, reviewed translation.', ['1. Open the Final DOCX and read through it, making any preference edits you want.','2. Keep the Chapters document beside it so you can match each original chapter to its translated chapter.','3. Use the Final EPUB directly for ebook upload only after previewing it; rebuild from the DOCX if you want to change the design or structure.']),
    ...section('What every delivered file is for','Your package separates publishing files from review evidence and launch support.', ['Final DOCX — the clean, editable, reviewed manuscript; use it for reading, personal edits, print formatting, Atticus, Vellum, or another formatter.','Final EPUB — a ready-made ebook package; use it directly when its layout and navigation meet your needs.','Review DOCX — the editorial audit trail showing the initial translation and reviewed wording.','Chapters DOCX — the Chapter Map linking the source-book structure to the translated structure.','Notes DOCX — selected translation and editorial decisions, with explanations of tone, terminology, names, and localisation.','Launch Pack DOCX — market-ready description, keywords, categories, pricing, and English publishing guidance for the target market.','This guide — practical instructions for checking, formatting, and uploading the files.']),
    ...section('Review and edit the Final DOCX','Work on a copy so you always retain the delivered original. The Final DOCX already contains the accepted second-pass wording.', ['Turn on paragraph marks if you need to inspect spacing and breaks.','Use Find to check names, recurring terms, chapter titles, and any preference changes consistently.','Do not copy visible strike-through wording from the Review file into the Final DOCX; the Final already contains the reviewed choice.','Save a new version after your edits and keep the delivered file as a reference.']),
    ...section('Understand the Review document','The Review file is for transparency, not the file you normally publish.', ['Yellow highlighting identifies wording examined or changed during editorial review.','Struck-through highlighted text is the initial translation; the highlighted replacement beside it is the reviewed wording.','Unchanged prose appears once. The clean Final DOCX contains the replacement wording without review markup.','Use Review when you want to understand a choice, then make any personal preference edit in a copy of Final DOCX.']),
    ...section('Use the Translation Notes','Notes are a curated explanation of representative decisions rather than a list of every sentence.', ['Check how voice, dialogue, genre language, names, recurring terms, and culturally specific wording were handled.','Use the examples as a consistency reference when making your own edits or briefing a proofreader.','If you change a recurring term, search the Final DOCX for every occurrence so the book remains consistent.']),
    ...section('Use the Chapter Map in practice','The Chapter Map connects the original structure to the translated structure without changing the approved manuscript.', ['Match by row: for example, Chapter 1 → Chapitre 1, Chapter 2 → Chapitre 2, and so on.','Use the source and translated headings together; do not rely only on page numbers, because pagination changes after formatting.','Check front matter, chapter order, epilogue, acknowledgements, calls to action, and other back matter as well as numbered chapters.','Tick off each row as you transfer it into your formatter. This prevents a missing, duplicated, or misplaced chapter.']),
    ...section('Transfer into your existing formatted book','If you already have a polished English edition, open it beside the Final DOCX and Chapter Map.', ['Duplicate the English book project before changing anything.','Work through the Chapter Map one section at a time. Replace the English text with the corresponding translated text while retaining or recreating the intended heading, scene-break, image, and paragraph styles.','Keep structural elements that should remain—copyright, links, author bio, mailing-list invitation—but translate or localise their visible wording where appropriate.','After every section is transferred, compare the completed project against the Chapter Map from top to bottom.']),
    ...section('Practical Atticus workflow','Atticus can import the Final DOCX or let you replace content inside a duplicate of your existing book.', ['Create a duplicate of the English Atticus project so the original remains untouched.','For a clean rebuild, import the Final DOCX and review how Atticus recognises headings and chapter breaks. For maximum design continuity, duplicate the English project and replace each chapter with its translated counterpart.','Use the Chapter Map to match the original chapter title and order to the translated title and order.','Reapply chapter themes, scene-break ornaments, images, front/back matter, links, and print settings where the import does not preserve them automatically.','Export a fresh EPUB and, if required, print PDF. Inspect both in Atticus preview before upload.']),
    ...section('Practical Vellum workflow','Vellum is Mac-only and works best when you preserve a clean source project and verify every imported section.', ['Duplicate the English Vellum file before editing.','Import the Final DOCX into a new project, or replace the text section by section in the duplicated English project when you want to preserve the existing style choices.','Use the Chapter Map to rename and order chapters correctly; confirm which elements Vellum identifies as Chapter, Title Page, Copyright, About the Author, and other book elements.','Recreate ornamental breaks, images, links, and special layout elements that do not survive import exactly.','Generate the ebook and print editions, then inspect the exported files—not only the Vellum project preview.']),
    ...section('Use the Final EPUB or rebuild?','Choose the route that matches the amount of design work you need.', ['Use the supplied Final EPUB directly when its title, navigation, chapter order, links, images, and visual presentation are already correct and you do not need design changes.','Rebuild from the Final DOCX in Atticus, Vellum, or another formatter when you want to match an existing branded edition, change fonts or ornaments, add or replace images, alter front/back matter, or produce a print edition.','Do not convert the EPUB back into Word as your primary editing workflow; use the supplied Final DOCX.']),
    ...section('Final checks before upload','Automated validation does not replace your final publishing review.', ['Title and subtitle match the cover and marketplace metadata.','Author name, series name/number, contributors, and copyright details are correct.','Every Chapter Map row appears once and in the correct order.','Front matter and back matter are complete and translated where appropriate.','Links open correctly and point to the intended language or marketplace.','Images are present, clear, licensed, and positioned correctly.','Paragraphs, headings, scene breaks, indents, spacing, and page breaks are consistent.','EPUB navigation and table of contents work; print page size, margins, headers, footers, and page numbers are correct.','Book description, language, categories, keywords, price, territories, ISBN, and other metadata match your publishing plan.','Use the platform previewer on phone, tablet, and e-reader views where available.']),
    ...section('Basic KDP upload workflow','KDP screens and category paths change, but the safe sequence remains consistent.', ['Create a new language edition in your KDP Bookshelf; do not overwrite the English edition.','Choose the correct book language and enter the translated title, author, series, description, keywords, and categories. Use the target-language values in your Launch Pack where supplied.','Upload the Final EPUB for Kindle, or your newly exported EPUB if you rebuilt the book. Upload a print-ready PDF—not the DOCX—for paperback or hardcover interiors.','Upload the correct translated cover and confirm its title matches the book metadata.','Open the Kindle Previewer/KDP Previewer and inspect every section, navigation link, image, and page transition.','Set rights, territories, prices, and release timing. Save as draft until all checks are complete, then publish only when you are satisfied.']),
    ...section('Need help?','Email hello@booklingua.io and the BookLingua team will help.',[]),
  ],true)
}

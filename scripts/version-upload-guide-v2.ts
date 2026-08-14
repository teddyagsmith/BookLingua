import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const source=path.join(process.cwd(),'public/assets/BookLingua_Author_Upload_Guide_v1.docx')
const output=path.join(process.cwd(),'public/assets/BookLingua_Author_Upload_Guide_v2.docx')
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const paragraph=(text:string,style?:'Heading1'|'Heading2')=>`<w:p>${style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:''}<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`
const section=(title:string,body:string[])=>paragraph(title,'Heading1')+body.map(text=>paragraph(text)).join('')

async function main(){
  const zip=await JSZip.loadAsync(fs.readFileSync(source)),file=zip.file('word/document.xml')
  if(!file)throw new Error('Upload Guide document.xml missing')
  let xml=await file.async('text')
  xml=xml.replaceAll('Chapter &amp; Subtitle Table','Chapter Map').replaceAll('Chapter &amp; Subtitle table','Chapter Map')
  const startText='1. Your Files',endText='2. Editing Your Translation Before Publishing'
  const startTextIndex=xml.indexOf(startText),endTextIndex=xml.indexOf(endText)
  if(startTextIndex<0||endTextIndex<0||endTextIndex<=startTextIndex)throw new Error('Upload Guide file section boundaries changed')
  const start=xml.lastIndexOf('<w:p',startTextIndex),end=xml.lastIndexOf('<w:p',endTextIndex)
  const deliveredFiles=section('1. Your Delivered Files',[
    'Final Translation — DOCX: Your clean, editable translation. Use this as your working manuscript when making changes or moving the book into formatting software.',
    'Final Translation — EPUB: The formatted ebook version. Check it in an EPUB reader or your publishing platform before uploading.',
    'Translation Review: Use this file to inspect the changes made during BookLingua’s translation review. It is not normally the file you upload as the final book.',
    'Chapter Map: Matches the original English chapters and headings to their translated equivalents while you edit, format, or upload the book.',
    'Translation Notes: Additional useful information and translation decisions, where supplied.',
    'Launch Pack: Marketing and launch material prepared for the target-language market when included with your order.',
    'BookLingua Author Upload Guide: This shared guide explains how to review, edit, format, and upload your translated files.',
  ])
  xml=xml.slice(0,start)+deliveredFiles+xml.slice(end)
  const usingMap=section('Using Your Chapter Map',[
    'Every BookLingua translation includes a Chapter Map. It links each original English chapter or major heading to its translated equivalent.',
    'Keep the Chapter Map open beside your Final Translation when reviewing or editing. Find the English chapter you know, then use the mapped translated heading to locate the same section in the translated manuscript.',
    'The map is especially useful when transferring chapters into Atticus, Vellum, KDP, or another formatting tool, and when checking the order around similarly named chapters.',
    'A translated chapter heading may not be a word-for-word rendering of the English heading. The Chapter Map provides the authoritative correspondence between them.',
    'If you change a chapter heading during your own edits, keep the map nearby so you can confirm that you are changing the intended chapter in every format.',
  ])
  const supportIndex=xml.indexOf('8. Contact and Support'),supportStart=xml.lastIndexOf('<w:p',supportIndex)
  if(supportIndex<0||supportStart<0)throw new Error('Upload Guide support section boundary changed')
  xml=xml.slice(0,supportStart)+usingMap+xml.slice(supportStart)
  xml=xml.replaceAll('Clean DOCX','Final Translation DOCX').replaceAll('Clean .docx','Final Translation .docx').replaceAll('Clean file','Final Translation file').replaceAll('the Clean file','the Final Translation file')
  const sect=xml.lastIndexOf('<w:sectPr')
  xml=xml.slice(0,sect)+paragraph('BookLingua Author Upload Guide — Version 2.0')+xml.slice(sect)
  zip.file('word/document.xml',xml,{date:new Date('2026-08-14T00:00:00.000Z')})
  fs.writeFileSync(output,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9}}))
  console.log(output)
}
main().catch(error=>{console.error(error);process.exitCode=1})

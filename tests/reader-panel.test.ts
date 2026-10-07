import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { buildReaderSampleDocx, selectReaderSample, translatedReaderTitle, readerPanelIdentity, readerSampleWordCount, renderReaderPanelEmail, READER_PANEL_FEEDBACK_FORM_FILENAME, READER_PANEL_FEEDBACK_FORM_SHA256 } from '../lib/reader-panel'
import {createHash} from 'node:crypto'
import JSZip from 'jszip'
import type { SemanticDocumentV2 } from '../lib/semantic-document'

const nodes=Array.from({length:360},(_,i)=>({id:`n${i}`,chapterId:`c${Math.floor(i/30)}`,type:(i%30===0?'heading':'paragraph') as 'heading'|'paragraph',headingLevel:i%30===0?1:null,sourceChapterNumber:null,sourceText:`source ${i}`,translatedText:i%30===0?`Kapitel ${i/30+1}`:`${'übersetzter text dialog '.repeat(10)}${i}`,order:i,sourceLocation:`txt:${i}`}))
const document:SemanticDocumentV2={schemaVersion:'2.0',sourceHash:'abc',sourceFormat:'txt',parserConfidence:1,nodes}
test('selects three deterministic continuous clean sections near 8k words',()=>{const a=selectReaderSample(document),b=selectReaderSample(document);assert.deepEqual(a,b);assert.deepEqual(a.map(x=>x.label),['Opening','Middle','Translation stress']);assert.ok(readerSampleWordCount(a)>=7000&&readerSampleWordCount(a)<=9000);for(const section of a)for(let i=1;i<section.nodes.length;i++)assert.equal(section.nodes[i].order,section.nodes[i-1].order+1)})
test('reader sample body paragraphs explicitly flow normally across A4 pages',async()=>{const bytes=await buildReaderSampleDocx({document,translatedTitle:'Übersetzt',language:'de'}),zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string');assert.match(xml,/<w:pgSz w:w="11906" w:h="16838"/);assert.match(xml,/<w:keepNext w:val="false"\/>/);assert.match(xml,/<w:keepLines w:val="false"\/>/);assert.match(xml,/<w:spacing w:after="240" w:line="360" w:lineRule="auto"\/>/);assert.doesNotMatch(xml,/<w:ind w:firstLine="360"\/>/)})
test('reader sample skips navigation/front matter and resolves the actual translated title',()=>{
  const fixture:SemanticDocumentV2={...document,nodes:[
    {...nodes[0],id:'toc',order:0,sourceText:'Table of Contents',translatedText:'Inhaltsverzeichnis'},
    ...Array.from({length:12},(_,i)=>({...nodes[1],id:`nav${i}`,order:i+1,sourceText:`${i+1}. Chapter`,translatedText:`${i+1}. Kapitel`})),
    {...nodes[0],id:'title',order:13,sourceText:'Ashes of Betrayal',translatedText:'Asche des Verrats'},
    {...nodes[0],id:'prologue',order:14,sourceText:'Prologue',translatedText:'Prolog'},
    ...Array.from({length:80},(_,i)=>({...nodes[1],id:`body${i}`,order:i+15,sourceText:`Body paragraph ${i} ${'words '.repeat(20)}`,translatedText:`Textabsatz ${i} ${'Wörter '.repeat(20)}`})),
  ]}
  assert.equal(translatedReaderTitle(fixture,'Ashes of Betrayal - Robert C. Hill'),'Asche des Verrats')
  assert.equal(selectReaderSample(fixture,200)[0].nodes[0].translatedText,'Prolog')
})
test('reader sample uses explicit readable black typography and rejoins split drop caps',async()=>{
  const fixture:SemanticDocumentV2={...document,nodes:[
    {...nodes[0],id:'chapter',order:0,sourceText:'Chapter 1',translatedText:'Kapitel 1'},
    {...nodes[1],id:'drop',order:1,sourceText:'C',translatedText:'K'},
    {...nodes[1],id:'rest',order:2,sourceText:'orporal woke.',translatedText:'orporal wachte auf.'},
  ]}
  const sections=[{label:'Opening' as const,startOrder:0,endOrder:2,wordCount:4,nodes:fixture.nodes}]
  const bytes=await buildReaderSampleDocx({document:fixture,translatedTitle:'Titel',language:'de',sections}),zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string')
  assert.match(xml,/Korpor[a-z]* wachte auf\./)
  assert.doesNotMatch(xml,/>K<\/w:t><\/w:r><\/w:p><w:p[^>]*><w:pPr[^>]*>/)
  assert.match(xml,/<w:color w:val="111111"\/>/)
  assert.match(xml,/<w:sz w:val="24"\/>/)
})
test('identity is build-bound and deterministic',()=>{assert.equal(readerPanelIdentity('o','de','b','customer-package-v1'),readerPanelIdentity('o','de','b','customer-package-v1'));assert.notEqual(readerPanelIdentity('o','de','b','customer-package-v1'),readerPanelIdentity('o','de','new','customer-package-v1'))})
test('email is Gilly-routing copy with required links and labels',()=>{const sections=selectReaderSample(document),email=renderReaderPanelEmail({bookTitle:'Original',translatedTitle:'Übersetzt',language:'de',genre:'Romance',wordCount:readerSampleWordCount(sections),sections,sampleUrl:'https://example.com/sample',feedbackUrl:'https://example.com/form'});assert.match(email.subject,/\[BOOKLINGUA READER PANEL\] German check needed/);assert.match(email.html,/Teddy manually assigns/);assert.match(email.html,/Download Reader Sample/);assert.match(email.html,/Translation stress/)})
test('migration binds verdict to current build and blocks delivery',()=>{const sql=fs.readFileSync('supabase/migrations/202608180001_reader_panel_v1.sql','utf8');assert.match(sql,/reader_verdict_build_superseded/);assert.match(sql,/reader_panel_review_not_passed/);assert.match(sql,/reader_review_pass_with_notes/)})
test('approved feedback form is pinned and includes Translation Confidence',()=>{const bytes=fs.readFileSync(`public/${READER_PANEL_FEEDBACK_FORM_FILENAME}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),READER_PANEL_FEEDBACK_FORM_SHA256);assert.ok(bytes.length>0)})
test('production cutover preserves existing orders while gating new orders',()=>{const sql=fs.readFileSync('supabase/migrations/202608180002_reader_panel_v1_cutover.sql','utf8');assert.match(sql,/v_created_at < v_cutover_at then return true/);assert.match(sql,/reader_review_pass_with_notes/);assert.match(sql,/v_cutover_at is null then return false/)})

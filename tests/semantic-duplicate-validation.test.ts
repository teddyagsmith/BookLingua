import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSourceAwareDuplicateParity, assertSourceAwareHeadingDuplicateParity } from '../lib/semantic-duplicate-validation'
import { SemanticNodeV2 } from '../lib/semantic-document'

const long=(value:string)=>`${value} ${'substantial source-aware duplicate validation prose '.repeat(4)}`
function nodes(values:string[],chapters:string[]=[]):SemanticNodeV2[]{return values.map((sourceText,order)=>({id:`node-${order+1}`,chapterId:chapters[order]||'chapter-1',type:'paragraph',headingLevel:null,sourceChapterNumber:null,sourceText,translatedText:null,order,sourceLocation:`fixture:${order}`}))}
function translated(source:SemanticNodeV2[],values:string[]):SemanticNodeV2[]{return source.map((node,index)=>({...node,translatedText:values[index]}))}

test('identical source repetition at the same two nodes permits identical translation',()=>{
  const source=nodes([long('signup'),long('middle unique'),long('signup')])
  assert.doesNotThrow(()=>assertSourceAwareDuplicateParity(source,translated(source,[long('inscription'),long('milieu unique'),long('inscription')])))
})

test('source repetition permits equivalent natural translation variants at the same identities',()=>{
  const source=nodes([long('signup'),long('signup')])
  assert.doesNotThrow(()=>assertSourceAwareDuplicateParity(source,translated(source,[
    long('recevez des offres et des lectures choisies dans votre boîte'),
    long('profitez de promotions et de sélections envoyées dans votre messagerie'),
  ])))
})

test('unique source nodes reject translation-introduced duplication',()=>{
  const source=nodes([long('source alpha'),long('source beta')])
  assert.throws(()=>assertSourceAwareDuplicateParity(source,translated(source,[long('traduction alpha'),long('traduction alpha')])),/introduced substantial duplicate/)
})

test('source repeated twice rejects a third unexpected translated occurrence',()=>{
  const source=nodes([long('repeat'),long('repeat'),long('unique third')])
  assert.throws(()=>assertSourceAwareDuplicateParity(source,translated(source,[long('répétition'),long('répétition'),long('répétition')])),/introduced substantial duplicate/)
})

test('source repeated twice rejects a missing translated occurrence through completeness',()=>{
  const source=nodes([long('repeat'),long('repeat')])
  assert.throws(()=>assertSourceAwareDuplicateParity(source,translated(source,[long('répétition'),''])),/requires translated text/)
})

test('repeated boilerplate in different chapters passes with exact source identity parity',()=>{
  const source=nodes([long('newsletter boilerplate'),long('chapter body'),long('newsletter boilerplate')],['front','chapter-4','back'])
  assert.doesNotThrow(()=>assertSourceAwareDuplicateParity(source,translated(source,[long('texte infolettre'),long('corps chapitre'),long('texte infolettre')])))
})

test('large newly duplicated translated section fails',()=>{
  const source=nodes([long('one distinct long section'),long('another distinct long section')])
  const duplicate='This translated section is unexpectedly duplicated across unrelated semantic nodes. '.repeat(5)
  assert.throws(()=>assertSourceAwareDuplicateParity(source,translated(source,[duplicate,duplicate])),/introduced substantial duplicate/)
})

test('heading duplication remains outside prose parity and independently blocked by artifact validation',()=>{
  const source=nodes([long('body one'),long('body two')]);source[0].type='heading';source[1].type='heading'
  assert.doesNotThrow(()=>assertSourceAwareDuplicateParity(source,translated(source,['Chapter 1','Chapter 1'])))
})

test('identical repeated source headings may remain identical in translation',()=>{
  const source=nodes(['What did they find?','What did they find?']);source[0].type='heading';source[1].type='heading'
  assert.doesNotThrow(()=>assertSourceAwareHeadingDuplicateParity(source,translated(source,['Was haben sie herausgefunden?','Was haben sie herausgefunden?'])))
})

test('different source headings may not collapse to one translated heading',()=>{
  const source=nodes(['Antibacterial findings','Cancer findings']);source[0].type='heading';source[1].type='heading'
  assert.throws(()=>assertSourceAwareHeadingDuplicateParity(source,translated(source,['Ergebnisse','Ergebnisse'])),/introduced duplicate heading/)
})

test('shared source heading fragments may retain the same translated prefix',()=>{
  const source=nodes(['Creating Your Personal','Creating Your']);source[0].type='heading';source[1].type='heading'
  assert.doesNotThrow(()=>assertSourceAwareHeadingDuplicateParity(source,translated(source,['Créer votre','Créer votre'])))
})

import { SemanticDocumentV2 } from './semantic-document'

export type ReaderRegister = 'formal_sie' | 'informal_du' | 'formal_vous' | 'informal_tu' | 'formal_voce' | 'informal_tu_pt' | 'neutral'

export function defaultReaderRegister(language:string,genre?:string):ReaderRegister{
  const informal=/romance|fiction|fantasy|thriller|mystery|erotica/.test((genre||'').toLowerCase())
  if(language==='de')return informal?'informal_du':'formal_sie'
  if(language==='fr')return informal?'informal_tu':'formal_vous'
  if(language==='pt-br'||language==='pt-pt')return informal?'informal_tu_pt':'formal_voce'
  return 'neutral'
}

export function readerRegisterInstruction(register:ReaderRegister):string{
  const instructions:Record<ReaderRegister,string>={
    formal_sie:'Use formal German Sie/Ihr/Ihnen consistently in every author-to-reader passage. Never switch to du/dich/dir/dein.',
    informal_du:'Use informal German du/dich/dir/dein consistently in every author-to-reader passage. Never switch to Sie/Ihnen/Ihr.',
    formal_vous:'Use French vous/votre consistently in every author-to-reader passage. Never switch to tu/te/ton.',
    informal_tu:'Use French tu/te/ton consistently in every author-to-reader passage. Never switch to vous/votre.',
    formal_voce:'Use the locale-appropriate formal Portuguese reader address consistently throughout.',
    informal_tu_pt:'Use informal Portuguese tu/te/teu consistently in every author-to-reader passage.',
    neutral:'Use one consistent, locale-appropriate reader register throughout the book.',
  }
  return instructions[register]
}

export function validateGermanReaderRegister(document:SemanticDocumentV2,register:ReaderRegister):string[]{
  if(register!=='formal_sie'&&register!=='informal_du')return []
  const forbidden=register==='formal_sie'?/\b(?:du|dich|dir|dein(?:e|em|en|er|es)?)\b/gi:/\b(?:Sie|Ihnen|Ihr(?:e|em|en|er|es)?)\b/g
  return document.nodes.flatMap(node=>{
    const matches=(node.translatedText||'').match(forbidden)
    return matches?.length?[`${node.id}: forbidden ${register==='formal_sie'?'informal':'formal'} German reader address (${matches.join(', ')})`]:[]
  })
}

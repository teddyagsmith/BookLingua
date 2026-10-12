import Anthropic from '@anthropic-ai/sdk'
import {createClient} from '@supabase/supabase-js'

const ORDER='a3341608-0fd7-4341-b74f-3f2905d1ce72'
const LANGUAGE='es-es'
const BUILD=process.env.GOING_WRONG_WAY_BUILD_ID||'c9b3e93e-8552-54d5-81c4-1652a8778130'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY!})

async function main(){
  const [{data:semantic,error:semanticError},{data:request,error:requestError}]=await Promise.all([
    db.from('semantic_documents').select('document').eq('order_id',ORDER).eq('language',LANGUAGE).eq('build_id',BUILD).eq('pass','pass2').single(),
    db.from('reader_panel_requests').select('selection').eq('order_id',ORDER).eq('language',LANGUAGE).order('created_at',{ascending:false}).limit(1).single(),
  ])
  if(semanticError||!semantic?.document)throw semanticError||new Error('Pass 2 document unavailable')
  if(requestError||!request?.selection)throw requestError||new Error('Reader selection unavailable')
  const nodes=semantic.document.nodes as Array<{id:string;order:number;sourceText:string;translatedText?:string}>
  const findings=[]
  for(const section of request.selection as Array<{label:string;startOrder:number;endOrder:number}>){
    const selected=nodes.filter(node=>node.order>=section.startOrder&&node.order<=section.endOrder&&node.sourceText.trim()&&(node.translatedText||'').trim())
    const pairs=selected.map(node=>({id:node.id,english:node.sourceText,spanish:node.translatedText}))
    const response=await anthropic.messages.create({
      model:'claude-opus-4-6',max_tokens:8000,temperature:0,
      system:'You are a senior native editor of European Spanish and a careful literary translation critic. Audit, do not rewrite creatively. The English is authoritative. Flag only objective meaning errors, omissions/additions, grammar errors, clearly unnatural European Spanish, inconsistent names/terms/register, or punctuation that would trip a reader. Preserve the author’s blunt memoir voice, humour, historical language, measurements, place names, motorcycle terms, and deliberate roughness. Return strict JSON only.',
      messages:[{role:'user',content:`Audit this ${section.label} sample from a published memoir translation. Return {"section":string,"verdict":"pass"|"pass_with_notes"|"fail","findings":[{"id":string,"severity":"high"|"medium"|"low","english":string,"spanish":string,"suggested":string,"reason":string}]}. Do not flag defensible style preferences.\n\n${JSON.stringify(pairs)}`}],
    })
    const text=response.content.find(block=>block.type==='text')
    if(!text||text.type!=='text')throw new Error(`No audit text for ${section.label}`)
    findings.push(JSON.parse(text.text.trim().replace(/^```json\s*/,'').replace(/\s*```$/,'')))
  }
  console.log(JSON.stringify({orderId:ORDER,buildId:BUILD,model:'claude-opus-4-6',sections:findings},null,2))
}

main().catch(error=>{console.error(error);process.exit(1)})

import Anthropic from '@anthropic-ai/sdk'
import { generateLaunchStrategy, LaunchPackExecutionMetadata, toCanonicalLaunchPack } from '../../lib/launch-strategy'
import { BOOKLINGUA_MODEL_CONFIG } from '../../lib/model-config'

const apiKey=process.env.ANTHROPIC_API_KEY!
if(!apiKey)throw new Error('Anthropic key missing')
const anthropic=new Anthropic({apiKey});let blockTypes:string[]=[];let metadata:LaunchPackExecutionMetadata|undefined
async function main(){const strategy=await generateLaunchStrategy({bookTitle:'Moonroot Synthetic',authorName:'Synthetic',genre:'fantasy',bookDescription:'A synthetic two-chapter fantasy about Mara protecting the Moonroot.',targetLanguage:'French',targetMarket:'France'},{attempt:1,requestId:'synthetic:fr:launch-pack',onMetadata:value=>{metadata=value},createMessage:async params=>{const response=await anthropic.messages.create({...params,thinking:{type:'adaptive'},output_config:{effort:'high'}} as any);blockTypes=response.content.map(block=>block.type);return response}});const pack=toCanonicalLaunchPack(strategy,'fr',true);if(blockTypes[0]==='text'||!blockTypes.includes('text'))throw new Error(`Expected non-text before text, got ${blockTypes.join(',')}`);console.log(JSON.stringify({model:BOOKLINGUA_MODEL_CONFIG.launchPack,blockTypes,metadata,canonicalIdentity:{schemaVersion:pack.schemaVersion,locale:pack.locale,market:pack.market,amazonDomain:pack.amazonDomain,currency:pack.currency}},null,2))}
main().catch(error=>{console.error(error);process.exitCode=1})

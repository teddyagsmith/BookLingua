import { createHash } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { estimateModelCostUsd } from './model-pricing'

function deterministicUuid(value:string):string{
  const h=createHash('sha256').update(value).digest('hex').slice(0,32).split('');h[12]='5';h[16]=((parseInt(h[16],16)&3)|8).toString(16)
  return `${h.slice(0,8).join('')}-${h.slice(8,12).join('')}-${h.slice(12,16).join('')}-${h.slice(16,20).join('')}-${h.slice(20).join('')}`
}

export interface ModelTelemetryInput {
  orderId:string; language:string; buildId?:string; stage:string; batchId?:string; attempt:number
  requestIdentity:string; provider:string; modelId:string; providerRequestId?:string
  success:boolean; inputTokens?:number; outputTokens?:number; cacheStatus?:'miss'|'hit'|'write'|'none'; errorCode?:string
}

export async function recordModelTelemetry(supabase:SupabaseClient,input:ModelTelemetryInput):Promise<void>{
  const id=deterministicUuid(`model-call:${input.requestIdentity}:${input.attempt}`)
  const estimate=estimateModelCostUsd(input.modelId,input.inputTokens,input.outputTokens)
  const {error}=await supabase.from('model_call_events').insert({
    id,order_id:input.orderId,language:input.language,build_id:input.buildId||null,stage:input.stage,
    batch_id:input.batchId||null,attempt:input.attempt,request_identity:input.requestIdentity,
    provider:input.provider,model_id:input.modelId,provider_request_id:input.providerRequestId||null,
    success:input.success,input_tokens:input.inputTokens??null,output_tokens:input.outputTokens??null,
    cache_status:input.cacheStatus||'none',error_code:input.errorCode||null,
    estimated_cost_usd:estimate?.cost??null,pricing_version:estimate?.pricingVersion??null,
  })
  if(error?.code!=='23505'&&error)throw new Error(`Model telemetry persistence failed: ${error.message}`)
}

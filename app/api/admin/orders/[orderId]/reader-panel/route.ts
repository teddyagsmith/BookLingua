import {NextRequest,NextResponse} from 'next/server'
import {getSupabaseAdmin} from '@/lib/supabase'

export async function GET(request:NextRequest,{params}:{params:{orderId:string}}){
 if(request.headers.get('x-admin-password')!==process.env.ADMIN_PASSWORD)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {data,error}=await getSupabaseAdmin().from('reader_panel_requests').select('id,language,build_id,state,sample_filename,sample_word_count,selection,email_state,requested_at,reviewed_at,verdict_notes').eq('order_id',params.orderId).order('language')
 if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({requests:data||[]})
}
export async function POST(request:NextRequest,{params}:{params:{orderId:string}}){
 if(request.headers.get('x-admin-password')!==process.env.ADMIN_PASSWORD)return NextResponse.json({error:'Unauthorized'},{status:401})
 const body=await request.json().catch(()=>null) as {language?:string;buildId?:string;verdict?:string;notes?:string}|null
 if(!body?.language||!body.buildId||!body.verdict)return NextResponse.json({error:'Language, build and verdict are required'},{status:400})
 const {data,error}=await getSupabaseAdmin().rpc('record_reader_panel_verdict',{p_order_id:params.orderId,p_language:body.language,p_build_id:body.buildId,p_state:body.verdict,p_notes:body.notes||null})
 if(error)return NextResponse.json({error:error.message},{status:409});return NextResponse.json({success:true,status:data})
}

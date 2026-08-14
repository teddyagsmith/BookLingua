import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyCustomerPortalToken, buildCustomerArtifactDownloadUrl } from '@/lib/download-token'
import { customerLanguageName, customerVisibleArtifacts, resolveCustomerDeliveryOrigin } from '@/lib/customer-delivery'
import type { PackageManifestV1 } from '@/lib/package-manifest'

export const dynamic='force-dynamic'

export default async function CustomerDownloads({params,searchParams}:{params:{orderId:string};searchParams:{token?:string}}){
  const token=searchParams.token||''
  if(!verifyCustomerPortalToken(params.orderId,token))return <ErrorCard message="This download link is invalid or incomplete." />
  const db=getSupabaseAdmin(),{data:order}=await db.from('orders').select('id,book_title,languages,status').eq('id',params.orderId).maybeSingle()
  if(!order||!['delivery_pending','completed'].includes(order.status))return <ErrorCard message="These files are not approved for customer delivery." />
  const origin=resolveCustomerDeliveryOrigin()
  const languages=(order.languages as string[])||[]
  const sections=[]
  for(const language of languages){
    const {data:build}=await db.from('order_language_builds').select('id').eq('order_id',order.id).eq('language',language).eq('is_current',true).maybeSingle()
    const {data:row}=build?await db.from('package_manifests').select('manifest').eq('order_id',order.id).eq('language',language).eq('build_id',build.id).eq('status','pass').maybeSingle():{data:null}
    if(!row?.manifest)return <ErrorCard message="A current validated language package is unavailable." />
    const items=customerVisibleArtifacts(order.book_title,row.manifest as PackageManifestV1).map(item=>({...item,url:buildCustomerArtifactDownloadUrl(order.id,language,item.type,origin)}))
    sections.push({language,name:customerLanguageName(language),items})
  }
  const guideUrl=`${origin}/api/download/${order.id}/guide?token=${encodeURIComponent(token)}`
  return <main className="min-h-screen bg-gradient-to-b from-violet-50 to-white px-5 py-12 text-gray-900"><div className="mx-auto max-w-4xl"><header className="mb-8"><div className="text-sm font-bold uppercase tracking-widest text-violet-700">BookLingua</div><h1 className="mt-2 text-4xl font-bold">Your translations are ready</h1><p className="mt-3 text-lg text-gray-600">{order.book_title}</p></header><div className="space-y-8"><section className="rounded-2xl bg-violet-700 p-6 text-white shadow-lg"><div className="text-sm font-bold uppercase tracking-widest text-violet-200">Start here</div><h2 className="mt-2 text-2xl font-bold">How to Use Your Translations + Upload Guide</h2><p className="mt-2 max-w-2xl text-violet-100">This explains each file we’ve provided, how to review your translation, and how to prepare your translated book for publishing.</p><a href={guideUrl} className="mt-5 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-violet-800">Download guide</a></section>{sections.map(section=><section key={section.language} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-bold">{section.name}</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{section.items.map(item=><a key={item.type} href={item.url} className="rounded-xl border border-violet-100 p-4 transition hover:border-violet-400 hover:bg-violet-50"><div className="font-semibold text-violet-800">{item.label}</div><div className="mt-1 text-sm text-gray-600">{item.description}</div><div className="mt-3 text-xs font-medium text-gray-500">{item.filename}</div></a>)}</div></section>)}</div><p className="mt-10 text-sm text-gray-500">Need help? Email hello@booklingua.io.</p></div></main>
}

function ErrorCard({message}:{message:string}){return <main className="min-h-screen bg-gray-50 px-5 py-20"><div className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow"><h1 className="text-2xl font-bold">BookLingua downloads</h1><p className="mt-3 text-gray-600">{message}</p><p className="mt-5 text-sm text-gray-500">Please contact hello@booklingua.io if you need a new link.</p></div></main>}

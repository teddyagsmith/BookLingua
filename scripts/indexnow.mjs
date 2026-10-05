// Ping IndexNow (Bing, Yandex, Naver, Seznam and others share the feed) with every URL in the live sitemap.
// Run after each deploy or new blog post:  node scripts/indexnow.mjs
// Or pass specific URLs:                    node scripts/indexnow.mjs https://booklingua.io/blog/new-post
const HOST = 'booklingua.io'
const KEY = process.env.INDEXNOW_KEY || '58244e6541c2427aba864ab90e799d71'

async function urlsFromSitemap() {
  const xml = await fetch(`https://${HOST}/sitemap.xml`).then((r) => r.text())
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]).filter((u) => !u.endsWith('feed.xml'))
}

const urlList = process.argv.length > 2 ? process.argv.slice(2) : await urlsFromSitemap()
const res = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
})
console.log(`IndexNow ${res.status} ${res.statusText} for ${urlList.length} URLs`)
urlList.forEach((u) => console.log('  ' + u))
if (res.status >= 400) process.exit(1)

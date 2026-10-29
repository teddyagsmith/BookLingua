export async function GET() {
  return Response.json({ ok: true, time: Date.now(), commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null })
}

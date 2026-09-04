import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization to avoid build-time errors when env vars aren't available
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

// Client for browser (limited permissions)
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// Admin client for server-side (full permissions)
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }
    _supabaseAdmin = createClient(url, key, {
      global: {
        // Package/build authority is mutable operational state. Next/Vercel
        // must not reuse a cached PostgREST GET after a rebuild is promoted.
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    })
  }
  return _supabaseAdmin
}

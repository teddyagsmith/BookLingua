'use client'

import { useState, useEffect, useCallback } from 'react'

type Order = {
  id: string
  email: string
  book_title: string
  word_count: number
  languages: string[]
  tier: string
  amount_paid: number
  api_cost: number | null
  margin_pct: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
}

type Stats = {
  todayRevenue: number
  todayOrders: number
  weekRevenue: number
  weekOrders: number
  totalRevenue: number
  totalOrders: number
  completedOrders: number
  failedOrders: number
  avgMargin: number | null
  totalApiCost: number
  alerts: Order[]
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
}

const LANG_NAMES: Record<string, string> = {
  fr: 'FR', de: 'DE', 'es-es': 'ES', 'es-latam': 'ES-LA',
  'pt-pt': 'PT', 'pt-br': 'PT-BR',
}

function fmt$(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function ago(s: string) {
  const mins = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': pw },
      })
      if (res.status === 401) { setError('Wrong password'); setAuthed(false); return }
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setOrders(data.orders)
      setStats(data.stats)
      setAuthed(true)
      setLastRefresh(new Date())
      sessionStorage.setItem('bl_admin_pw', pw)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-restore session
  useEffect(() => {
    const saved = sessionStorage.getItem('bl_admin_pw')
    if (saved) { setPassword(saved); fetchData(saved) }
  }, [fetchData])

  // Auto-refresh every 60s
  useEffect(() => {
    if (!authed) return
    const t = setInterval(() => fetchData(password), 60000)
    return () => clearInterval(t)
  }, [authed, password, fetchData])

  const filteredOrders = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return o.email.toLowerCase().includes(q) || o.book_title.toLowerCase().includes(q) || o.id.includes(q)
    }
    return true
  })

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-violet-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📚</div>
            <h1 className="text-2xl font-bold text-gray-900">BookLingua Admin</h1>
            <p className="text-gray-500 text-sm mt-1">Enter your admin password</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); fetchData(password) }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg mb-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-4 sticky top-0 z-10 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">📚 BookLingua Admin</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {lastRefresh && <span className="opacity-70 hidden sm:block">Updated {ago(lastRefresh.toISOString())}</span>}
            <button
              onClick={() => fetchData(password)}
              disabled={loading}
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              {loading ? '↻' : '↻ Refresh'}
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('bl_admin_pw'); setAuthed(false) }}
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Alerts */}
        {stats && stats.alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h2 className="font-semibold text-red-800 mb-2">⚠️ {stats.alerts.length} order{stats.alerts.length > 1 ? 's' : ''} need attention</h2>
            {stats.alerts.map(o => (
              <div key={o.id} className="text-sm text-red-700 flex items-center gap-2 py-1 border-t border-red-100">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                <span className="font-medium">{o.book_title}</span>
                <span className="text-red-500">{o.email}</span>
                <span className="ml-auto opacity-60">{ago(o.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-medium">Today</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt$(stats.todayRevenue)}</p>
              <p className="text-sm text-gray-500">{stats.todayOrders} order{stats.todayOrders !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-medium">This week</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt$(stats.weekRevenue)}</p>
              <p className="text-sm text-gray-500">{stats.weekOrders} orders</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-medium">All time</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt$(stats.totalRevenue)}</p>
              <p className="text-sm text-gray-500">{stats.totalOrders} orders</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-medium">Avg margin</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.avgMargin != null ? `${stats.avgMargin.toFixed(0)}%` : '—'}
              </p>
              <p className="text-sm text-gray-500">API cost {fmt$(stats.totalApiCost)}</p>
            </div>
          </div>
        )}

        {/* Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search email, title, ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="flex gap-2 flex-wrap">
              {['all', 'completed', 'processing', 'failed', 'pending'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${filter === s ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table — desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Book / Customer</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Words</th>
                  <th className="px-4 py-3 text-left">Langs</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">API cost</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">{o.book_title}</p>
                      <p className="text-gray-400 text-xs truncate max-w-[200px]">{o.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{o.word_count?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(Array.isArray(o.languages) ? o.languages : JSON.parse(o.languages || '[]')).map(l => (
                          <span key={l} className="bg-violet-50 text-violet-700 text-xs px-1.5 py-0.5 rounded font-medium">
                            {LANG_NAMES[l] || l.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt$(Number(o.amount_paid))}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{o.api_cost != null ? fmt$(Number(o.api_cost)) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {o.margin_pct != null ? (
                        <span className={Number(o.margin_pct) > 50 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                          {Number(o.margin_pct).toFixed(0)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-gray-400">No orders found</div>
            )}
          </div>

          {/* Card list — mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {filteredOrders.map(o => (
              <div key={o.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{o.book_title}</p>
                    <p className="text-gray-400 text-xs truncate">{o.email}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                    {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">{o.word_count?.toLocaleString()} words</span>
                  <span className="font-medium">{fmt$(Number(o.amount_paid))}</span>
                  {o.margin_pct != null && (
                    <span className={Number(o.margin_pct) > 50 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                      {Number(o.margin_pct).toFixed(0)}% margin
                    </span>
                  )}
                  <div className="flex gap-1 ml-auto">
                    {(Array.isArray(o.languages) ? o.languages : JSON.parse(o.languages || '[]')).map(l => (
                      <span key={l} className="bg-violet-50 text-violet-700 text-xs px-1.5 py-0.5 rounded font-medium">
                        {LANG_NAMES[l] || l.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-gray-400 text-xs">{fmtDate(o.created_at)}</p>
              </div>
            ))}
            {filteredOrders.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">No orders found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

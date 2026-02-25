'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-violet-50 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-xl">
            <span className="text-white text-5xl">✓</span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Payment Successful! 🎉
          </h1>

          <p className="text-gray-600 mb-6">
            Thank you for your order! We've sent a confirmation email with all the details.
          </p>

          <div className="bg-violet-50 rounded-2xl p-6 mb-8 text-left">
            <h3 className="font-bold text-gray-900 mb-4">What happens next?</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Translation (2-3 days)</p>
                  <p className="text-sm text-gray-600">Our AI translates your manuscript while preserving formatting</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Editorial Review (1-2 days)</p>
                  <p className="text-sm text-gray-600">Premium AI reviews for cultural accuracy and natural phrasing</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Delivery via Email</p>
                  <p className="text-sm text-gray-600">Download links for your translated files in the same format you uploaded</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-500">
              Order ID: <span className="font-mono text-xs">{sessionId?.slice(-12)}</span>
            </p>
          </div>

          <a
            href="/"
            className="inline-block px-8 py-3 bg-gradient-to-r from-rose-500 to-violet-600 text-white rounded-xl font-bold hover:shadow-lg transition-all"
          >
            ← Back to BookLingua
          </a>
        </div>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}

const tiers = [
  ['Up to 40,000 words', '$99'],
  ['Up to 80,000 words', '$149'],
  ['Up to 150,000 words', '$199'],
]

export default function BookLinguaPricingTable() {
  return (
    <div className="not-prose my-8 overflow-hidden rounded-2xl border border-[#DDD6EC] bg-white shadow-sm">
      <div className="hidden grid-cols-[1fr_auto] bg-[#F3F0F8] px-5 py-3 text-sm font-bold text-gray-900 sm:grid">
        <span>Manuscript length</span>
        <span>One language</span>
      </div>
      <div className="divide-y divide-[#EBE6F4]">
        {tiers.map(([length, price]) => (
          <div key={length} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wide text-[#7B6CA8] sm:hidden">Manuscript length</span>
              <span className="font-medium text-gray-800">{length}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs font-bold uppercase tracking-wide text-[#7B6CA8] sm:hidden">One language</span>
              <span className="text-lg font-bold text-gray-900">{price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

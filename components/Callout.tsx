interface CalloutProps {
  children: React.ReactNode
  label?: string
}

export default function Callout({ children, label = 'BookLingua example' }: CalloutProps) {
  return (
    <div className="my-6 rounded-2xl border-l-4 border-[#7B6CA8] bg-[#F3F0F8] p-5 shadow-sm">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#7B6CA8]">
        {label}
      </p>
      <div className="text-[15px] leading-relaxed text-gray-700">
        {children}
      </div>
    </div>
  )
}

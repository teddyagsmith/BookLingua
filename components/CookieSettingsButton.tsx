'use client'

export default function CookieSettingsButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event('booklingua:cookie-settings'))} className="hover:text-white transition-colors">Cookie settings</button>
}

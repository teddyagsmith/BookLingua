import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

// Email sequence configuration - 5-day welcome sequence
const WELCOME_SEQUENCE = [
  {
    day: 0,
    subject: "The European book market: 3x bigger than you think 🌍",
    getHtml: (email: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <h1 style="color: #7c3aed; font-size: 24px;">Your book could be selling in 5 countries right now.</h1>
        
        <p>Most indie authors publish on Amazon.com, sell to US readers, and call it a day.</p>
        
        <p>Meanwhile, translated fiction makes up <strong>25% of all fiction sales in Germany</strong>. In France, it's 18%. Spain? 15% and growing fast.</p>
        
        <p>Here's the kicker: <strong>96% of self-published books never get translated.</strong> The competition in European markets is a fraction of what you face in English.</p>
        
        <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #7c3aed;">📊 The numbers</h3>
          <p style="margin-bottom: 8px;"><strong>Germany:</strong> €3.2B book market</p>
          <p style="margin-bottom: 8px;"><strong>France:</strong> €2.8B book market</p>
          <p style="margin-bottom: 8px;"><strong>Spain:</strong> €1.1B (fastest growing)</p>
          <p style="margin-bottom: 8px;"><strong>Italy:</strong> €800M (underserved opportunity)</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 12px 0;">
          <p style="margin-bottom: 8px;"><strong>🎯 Lower costs:</strong> Amazon PPC is 40-60% cheaper in DE/FR/ES</p>
          <p style="margin-bottom: 8px;"><strong>🎯 Less competition:</strong> Keywords that are saturated in English have minimal competition</p>
          <p style="margin: 0;"><strong>🎯 Same effort:</strong> Your book, already written, just translated</p>
        </div>
        
        <p>And it's not just Europe...</p>
        
        <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #059669;">🌎 The bonus markets nobody talks about</h3>
          <p style="margin-bottom: 8px;"><strong>650 million</strong> Spanish speakers in South America</p>
          <p style="margin-bottom: 8px;"><strong>300 million</strong> Portuguese speakers in Brazil</p>
          <p style="margin: 0;"><strong>50 million</strong> Spanish speakers in the USA</p>
        </div>
        
        <p>And it's not just Amazon. Europeans buy from Legimi, Thalia, Decitre, Casa del Libro, and Kobo.</p>
        
        <p>Same book. Same work you've already done. Just translated.</p>
        
        <p>BookLingua gets you there in 48 hours for $99-199 per language — not $5,000 and 6 weeks.</p>
        
        <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%;"><tr>
            <td style="width: 60px; vertical-align: top;"><div style="width: 50px; height: 50px; border-radius: 50%; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 16px; text-align: center; line-height: 50px;">MS</div></td>
            <td style="vertical-align: top; padding-left: 12px;">
              <p style="margin: 0;"><strong>"I launched the translated book in Italy and already have over 500 paid downloads and 20,000 Kindle read pages. Very happy to get a new audience in a new country!"</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">— Maxine Savage, author of <em>Playing With Diamonds</em></p>
            </td>
          </tr></table>
        </div>
        
        <div style="background: #fff7ed; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px;"><strong>Worried it won't be right?</strong> Our 2-pass editorial review catches issues before they reach you. If anything slips through, we fix it free. Not happy within 7 days? Full money-back, no questions asked.</p>
        </div>
        
        <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">Ready to reach European readers?</p>
          <a href="https://booklingua.io/?utm_source=email&utm_medium=welcome&utm_campaign=email1" style="display: inline-block; background: white; color: #7c3aed; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Start Your Translation →</a>
        </div>
        
        <p>Tomorrow: The problem with AI translation (and why most authors get it wrong).</p>
        
        <p>Teddy<br>Founder, BookLingua</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <a href="https://booklingua.io/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    `
  },
  {
    day: 1,
    subject: "Why AI translation alone loses readers (and sales)",
    getHtml: (email: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <h1 style="color: #7c3aed; font-size: 24px;">AI translation gets you 80% there. It's the 20% that kills sales.</h1>
        
        <p>I tested this. Gave 50 German readers the same romance novel opening in three versions:</p>
        
        <ol>
          <li>Professional human translator ($0.12/word = ~$8,000 for a novel)</li>
          <li>Raw AI translation (cheap, but broken)</li>
          <li>AI + editorial review (what BookLingua does)</li>
        </ol>
        
        <div style="background: #fef2f2; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #dc2626;">❌ Raw AI problems readers noticed:</h3>
          <ul style="margin-bottom: 0;">
            <li>"She looked at her watch" became "She looked at her clock" — lost the urgency</li>
            <li>American slang like "cool" translated literally — Germans don't say that</li>
            <li>Tone shifts mid-scene — romantic tension became clinical description</li>
            <li>Genre beats missed — thriller pacing felt "off"</li>
          </ul>
        </div>
        
        <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #7c3aed;">✅ BookLingua: AI + Editorial Review</h3>
          <p style="margin-bottom: 12px;"><strong>Before:</strong> "The castle stood on the hill, old and dark."</p>
          <p style="margin-bottom: 12px;"><strong>After:</strong> "Das Schloss thronte auf dem Hügel, alt und finster — ein Mahnmal vergessener Größe." <em>(The castle towered on the hill, old and sinister — a monument to forgotten grandeur.)</em></p>
          <p style="margin: 0; font-size: 14px; color: #666;"><em>The editorial pass caught the tone, the metaphor, the Gothic atmosphere German readers expect. You see every change highlighted in yellow.</em></p>
        </div>
        
        <p>A second AI pass that catches cultural references, fixes tone consistency, adjusts for genre conventions, and shows you every change with yellow highlights.</p>
        
        <p><strong>Reader rating:</strong> Raw AI got 2.8/5. AI + editorial got 4.4/5. Human translation got 4.6/5.</p>
        
        <p>That's 95% of human quality at 10% of the cost. In 48 hours instead of 6 weeks.</p>
        
        <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%;"><tr>
            <td style="width: 60px; vertical-align: top;"><img src="https://booklingua.io/lily-bleu-testimonial.jpg" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" alt="Lily Bleu"></td>
            <td style="vertical-align: top; padding-left: 12px;">
              <p style="margin: 0;"><strong>"The translation is incredibly accurate as if written by a qualified translator. My book is now live in Amazon France and Germany, and I didn't need to make any changes to the manuscript. Great service!"</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">— Lily Bleu, French author</p>
            </td>
          </tr></table>
        </div>
        
        <div style="background: #fff7ed; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px;"><strong>Worried it won't be right?</strong> Our 2-pass editorial review catches issues before they reach you. If anything slips through, we fix it free. Not happy within 7 days? Full money-back, no questions asked.</p>
        </div>
        
        <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">Want the 4.4/5 quality without the $8,000 price tag?</p>
          <a href="https://booklingua.io/?utm_source=email&utm_medium=welcome&utm_campaign=email2" style="display: inline-block; background: white; color: #7c3aed; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">See Pricing →</a>
        </div>
        
        <p>Next: The keywords that get your book found in Europe.</p>
        
        <p>Teddy<br>BookLingua</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <a href="https://booklingua.io/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    `
  },
  {
    day: 2,
    subject: "The keywords that make (or break) your European launch",
    getHtml: (email: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <h1 style="color: #7c3aed; font-size: 24px;">"Vampire romance" doesn't translate to "Liebesroman Vampire." Here's what does.</h1>
        
        <p>You've translated your book. Great. Now how do readers find it?</p>
        
        <p>Here's what most authors miss: <strong>Keyword research is different in every country.</strong></p>
        
        <p>Example from actual data:</p>
        
        <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #7c3aed;">Same book, different keywords</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;"><strong>English:</strong></td>
              <td style="padding: 8px 0;">vampire romance → 50K searches/month</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;"><strong>German:</strong></td>
              <td style="padding: 8px 0;">Vampir Liebesroman → 12K — <em style="color: #666;">But: paranormal romance → 22K</em></td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>French:</strong></td>
              <td style="padding: 8px 0;">romance vampire → 8K — <em style="color: #666;">But: romance fantastique → 31K</em></td>
            </tr>
          </table>
        </div>
        
        <p>Direct translation often misses <strong>how readers actually search.</strong></p>
        
        <p><strong>BookLingua's keyword research gets this right for you:</strong></p>
        
        <ul>
          <li>✅ 10-15 local keywords for your genre</li>
          <li>✅ Category recommendations per country</li>
          <li>✅ Competitor analysis (who's ranking, why)</li>
          <li>✅ Blurb optimization tips</li>
        </ul>
        
        <p>No more guessing. BookLingua finds the terms your actual readers are typing into search boxes.</p>
        
        <div style="background: #fff7ed; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 0;"><strong>Real example:</strong> An author used our keyword recommendations for her German launch. Her book hit #3 in paranormal romance within 48 hours. Same book, better positioning.</p>
        </div>
        
        <p>But here's what separates the authors who make money from those who don't: <strong>the launch.</strong></p>
        
        <p>That's where the <strong>Launch Strategy Pack</strong> comes in. It's a complete launch system that saves you weeks of research and stops you making expensive mistakes:</p>
        
        <ul>
          <li>✅ <strong>Marketing plan day by day</strong> — every day mapped out from pre-launch to post-launch</li>
          <li>✅ <strong>Facebook groups and newsletters to try</strong> — curated list of active communities in your target language, plus the exact pitch</li>
          <li>✅ <strong>7 backend keyword slots filled</strong> — the exact search terms German/French/Spanish readers use</li>
          <li>✅ <strong>Amazon ad keywords</strong> — pre-researched PPC keywords with estimated CPC and competition level</li>
          <li>✅ <strong>Categories</strong> — pick wrong and your book is invisible; pick right and you hit bestseller lists with fewer sales</li>
          <li>✅ <strong>Upload checklist</strong> — step-by-step KDP guide for each country; one missed setting and your book goes live broken</li>
        </ul>
        
        <p>20+ hours of research saved. Costly launch mistakes avoided.</p>
        
        <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">Ready to get found in Europe?</p>
          <a href="https://booklingua.io/?utm_source=email&utm_medium=welcome&utm_campaign=email3" style="display: inline-block; background: white; color: #7c3aed; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Start Your Translation →</a>
        </div>
        
        <p>Next: How to actually market your book once it's live.</p>
        
        <p>Teddy<br>BookLingua</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <a href="https://booklingua.io/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    `
  },
  {
    day: 3,
    subject: "The 30-day European launch playbook",
    getHtml: (email: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <h1 style="color: #7c3aed; font-size: 24px;">Translation is step one. Here's the launch plan that actually works.</h1>
        
        <p>Most authors: translate → upload → wait.</p>
        
        <p>Authors who make money: translate → launch → build.</p>
        
        <p>Here's how BookLingua fits into every step:</p>
        
        <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #7c3aed;">📅 Week 1: Foundation</h3>
          <p style="margin: 0;"><strong>BookLingua helps:</strong> Your Translation Notes include cultural context so beta readers catch fewer issues. Your keyword research tells you which Facebook groups are most active for your genre.</p>
        </div>
        
        <div style="background: #fff7ed; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #ea580c;">📅 Week 2: Pre-launch</h3>
          <p style="margin: 0;"><strong>BookLingua helps:</strong> Your Launch Strategy Pack includes ready-to-use newsletter swap pitches and ad copy tested in DE/FR/ES. No writing blind. No wasted ad budget.</p>
        </div>
        
        <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #059669;">📅 Week 3: Launch</h3>
          <p style="margin: 0;"><strong>BookLingua helps:</strong> Your promo site directory tells you exactly which German/French/Spanish book promotion sites to hit each day. Your category guide ensures you're listed correctly from day one — no costly re-categorization.</p>
        </div>
        
        <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #2563eb;">📅 Week 4: Optimize</h3>
          <p style="margin: 0;"><strong>BookLingua helps:</strong> Your post-launch checklist walks you through exactly what to tweak. And when you're ready for Book 2? Your Translation Notes become your style guide — ensuring consistency across your entire series.</p>
        </div>
        
        <p>40+ hours of research avoided. A proven system followed.</p>
        
        <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%;"><tr>
            <td style="width: 60px; vertical-align: top;"><div style="width: 50px; height: 50px; border-radius: 50%; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 16px; text-align: center; line-height: 50px;">MS</div></td>
            <td style="vertical-align: top; padding-left: 12px;">
              <p style="margin: 0;"><strong>"I launched the translated book in Italy and already have over 500 paid downloads and 20,000 Kindle read pages. Very happy to get a new audience in a new country!"</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">— Maxine Savage, author of <em>Playing With Diamonds</em></p>
            </td>
          </tr></table>
        </div>
        
        <p><strong>The Launch Strategy Pack ($29/language):</strong> Marketing plan day by day · Facebook groups and newsletters · 7 backend keyword slots · Amazon ad keywords · Categories guide · Upload checklist</p>
        
        <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">Get the full playbook with your translation</p>
          <a href="https://booklingua.io/?utm_source=email&utm_medium=welcome&utm_campaign=email4" style="display: inline-block; background: white; color: #7c3aed; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Pricing →</a>
        </div>
        
        <p>Final email tomorrow: Your 20% off code.</p>
        
        <p>Teddy<br>BookLingua</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <a href="https://booklingua.io/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    `
  },
  {
    day: 4,
    subject: "Ready to translate? Here's 20% off.",
    getHtml: (email: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <h1 style="color: #7c3aed; font-size: 24px;">You've got the knowledge. Now get the translation.</h1>
        
        <p>Over the past 5 days, I've shown you:</p>
        
        <ul>
          <li>✅ The €8B+ European market waiting for your book</li>
          <li>✅ Why AI alone isn't enough (and how editorial review fixes it)</li>
          <li>✅ The keyword research that gets you found</li>
          <li>✅ The 30-day launch playbook</li>
        </ul>
        
        <p>Now it's decision time.</p>
        
        <div style="background: #f5f3ff; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #7c3aed;">What you get with every BookLingua translation:</h3>
          <ul style="margin-bottom: 0;">
            <li>AI translation + 2-pass editorial review</li>
            <li>Yellow-highlighted changes so you see every edit</li>
            <li>Translation notes explaining key decisions</li>
            <li>Files ready for KDP upload</li>
          </ul>
        </div>
        
        <p><strong>Starting at $99 per language.</strong> No $5,000 freelancer fees. No 6-week wait.</p>
        
        <p>Want to give your book the best possible launch? <strong>Add the Launch Strategy Pack for $29 per language</strong> — day-by-day marketing plan, curated Facebook groups and newsletters, 7 backend keyword slots, Amazon ad keywords, categories guide, and upload checklist. Saves 20+ hours and protects you from costly launch mistakes.</p>
        
        <p><strong>Here's what authors are saying:</strong></p>
        
        <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%;"><tr>
            <td style="width: 60px; vertical-align: top;"><img src="https://booklingua.io/lily-bleu-testimonial.jpg" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" alt="Lily Bleu"></td>
            <td style="vertical-align: top; padding-left: 12px;">
              <p style="margin: 0;"><strong>"The translation is incredibly accurate as if written by a qualified translator. My book is now live in Amazon France and Germany, and I didn't need to make any changes to the manuscript. Great service!"</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">— Lily Bleu, French author</p>
            </td>
          </tr></table>
        </div>
        
        <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <table style="width: 100%;"><tr>
            <td style="width: 60px; vertical-align: top;"><div style="width: 50px; height: 50px; border-radius: 50%; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 16px; text-align: center; line-height: 50px;">MS</div></td>
            <td style="vertical-align: top; padding-left: 12px;">
              <p style="margin: 0;"><strong>"I launched the translated book in Italy and already have over 500 paid downloads and 20,000 Kindle read pages. Very happy to get a new audience in a new country!"</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">— Maxine Savage, author of <em>Playing With Diamonds</em></p>
            </td>
          </tr></table>
        </div>
        
        <div style="background: #fff7ed; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px;"><strong>Still unsure?</strong> 7-day money-back guarantee. If you're not completely happy, full refund. And if anything needs fixing? We fix it free, no questions asked. Our 2-pass editorial system catches problems before they reach you — but if anything slips through, we've got you covered.</p>
        </div>
        
        <div style="background: #7c3aed; color: white; padding: 28px; border-radius: 12px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">Email subscribers only</p>
          <p style="margin: 0 0 16px 0; font-size: 28px; font-weight: bold;">20% OFF</p>
          <p style="margin: 0 0 20px 0; font-size: 16px;">Use code <strong style="font-size: 20px; letter-spacing: 1px;">LAUNCH20</strong></p>
          <a href="https://booklingua.io/?code=LAUNCH20&utm_source=email&utm_medium=welcome&utm_campaign=email5" style="display: inline-block; background: white; color: #7c3aed; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Start Your Translation →</a>
        </div>
        
        <p style="text-align: center; color: #6b7280; font-size: 14px;">Code expires in 7 days. One use per customer.</p>
        
        <p>Your European readers are waiting.</p>
        
        <p>Teddy<br>Founder, BookLingua</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <a href="https://booklingua.io/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    `
  }
]

/**
 * Trigger welcome email for new subscriber
 * POST /api/welcome-email
 * {
 *   email: string,
 *   day?: number // which email to send (0, 1, 2, 3, 4), defaults to 0
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { email, day = 0 } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const sequence = WELCOME_SEQUENCE.find(s => s.day === day)
    if (!sequence) {
      return NextResponse.json({ error: `No email for day ${day}` }, { status: 400 })
    }

    // Send the email
    const { error } = await resend.emails.send({
      from: 'Teddy @ BookLingua <hello@booklingua.io>',
      to: email,
      subject: sequence.subject,
      html: sequence.getHtml(email),
      replyTo: 'hello@booklingua.io',
    })

    if (error) {
      console.error('Welcome email error:', error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    // Update subscriber record with sequence progress
    const { error: updateError } = await supabaseAdmin
      .from('email_subscribers')
      .update({
        welcome_sequence_day: day,
        last_email_sent_at: new Date().toISOString(),
        last_email_subject: sequence.subject,
      })
      .eq('email', email.toLowerCase().trim())

    if (updateError) {
      console.error('Failed to update subscriber:', updateError)
    }

    return NextResponse.json({
      success: true,
      day,
      subject: sequence.subject,
    })
  } catch (err) {
    console.error('Welcome email error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Get sequence status for subscriber
 * GET /api/welcome-email?email=xxx
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({
      sequence: WELCOME_SEQUENCE.map(s => ({
        day: s.day,
        subject: s.subject,
      }))
    })
  }

  const { data, error } = await supabaseAdmin
    .from('email_subscribers')
    .select('welcome_sequence_day, last_email_sent_at, last_email_subject')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error) {
    return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
  }

  return NextResponse.json({
    email,
    currentDay: data?.welcome_sequence_day ?? null,
    lastEmailSent: data?.last_email_sent_at ?? null,
    lastSubject: data?.last_email_subject ?? null,
    nextEmail: WELCOME_SEQUENCE.find(s => s.day > (data?.welcome_sequence_day ?? -1)) ?? null,
  })
}

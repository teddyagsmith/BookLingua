import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const resend = new Resend(process.env.RESEND_API_KEY)

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
}

// This would be called by a background job processor (e.g., Inngest, Trigger.dev)
// For MVP, you can call this manually or set up a simple cron job

export async function POST(request: NextRequest) {
  try {
    const { orderId, bookContent, bookTitle, authorName, email, languages, genre } = await request.json()

    const translations: Record<string, { original: string; edited: string; changes: any[] }> = {}

    for (const langCode of languages) {
      const langName = LANGUAGE_NAMES[langCode]

      // Pass 1: Translation with Claude Sonnet
      console.log(`Translating to ${langName}...`)
      
      const translationResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100000,
        messages: [
          {
            role: 'user',
            content: `You are a professional literary translator specializing in ${genre || 'romance'} novels. 

Translate the following book excerpt into ${langName}. 

IMPORTANT GUIDELINES:
- Preserve the author's unique voice and writing style
- Maintain the emotional impact and romantic tension
- Keep dialogue natural and culturally appropriate for ${langName} readers
- Preserve any character names unless they have common equivalents
- Handle intimate scenes with the same level of explicitness as the original

BOOK TITLE: ${bookTitle}
AUTHOR: ${authorName}

TEXT TO TRANSLATE:
${bookContent.slice(0, 50000)} 

Provide ONLY the translation, no explanations or notes.`,
          },
        ],
      })

      const translatedText = translationResponse.content[0].type === 'text' 
        ? translationResponse.content[0].text 
        : ''

      // Pass 2: Editorial Review with Claude Opus
      console.log(`Editorial review for ${langName}...`)
      
      const editorialResponse = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 100000,
        messages: [
          {
            role: 'user',
            content: `You are a senior ${langName} literary editor specializing in ${genre || 'romance'} novels.

Review this translation and make improvements. For each change you make, explain why.

ORIGINAL ENGLISH:
${bookContent.slice(0, 25000)}

TRANSLATION TO REVIEW:
${translatedText.slice(0, 25000)}

Respond in this JSON format:
{
  "editedText": "the full edited translation...",
  "changes": [
    {
      "original": "original phrase",
      "edited": "improved phrase",
      "reason": "why you made this change",
      "type": "style|dialogue|cultural|description|grammar|consistency"
    }
  ]
}

Focus on:
- Cultural adaptations (terms of endearment, idioms)
- Natural dialogue flow
- Emotional impact
- Show don't tell improvements
- Consistency in character voices`,
          },
        ],
      })

      const editorialContent = editorialResponse.content[0].type === 'text'
        ? editorialResponse.content[0].text
        : '{}'

      try {
        const parsed = JSON.parse(editorialContent)
        translations[langCode] = {
          original: translatedText,
          edited: parsed.editedText || translatedText,
          changes: parsed.changes || [],
        }
      } catch {
        translations[langCode] = {
          original: translatedText,
          edited: translatedText,
          changes: [],
        }
      }
    }

    // In production, you would:
    // 1. Generate DOCX/EPUB files
    // 2. Upload to storage (S3, R2, etc.)
    // 3. Generate signed download URLs
    // 4. Send email with links

    // For MVP, send the translations directly
    const downloadLinks = languages.map((lang: string) => ({
      language: LANGUAGE_NAMES[lang],
      flag: lang === 'es' ? '🇪🇸' : lang === 'fr' ? '🇫🇷' : lang === 'de' ? '🇩🇪' : '🇵🇹',
      // In production, these would be actual download URLs
      url: `${process.env.NEXT_PUBLIC_APP_URL}/download/${orderId}/${lang}`,
    }))

    // Send completion email
    await resend.emails.send({
      from: 'TranslateABook <orders@translateabook.com>',
      to: email,
      subject: `Your translations are ready: ${bookTitle} 🎉`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>
          
          <p>Hi ${authorName},</p>
          
          <p>Great news! Your translations for <strong>${bookTitle}</strong> are complete and ready for download.</p>
          
          <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Download Your Translations</h3>
            ${downloadLinks.map((link: any) => `
              <p>
                <span style="font-size: 24px;">${link.flag}</span>
                <strong>${link.language}:</strong>
                <a href="${link.url}" style="color: #7c3aed;">Download DOCX</a>
              </p>
            `).join('')}
          </div>
          
          <h3>Editorial Changes Summary</h3>
          <p>Our AI editor made the following improvements:</p>
          ${Object.entries(translations).map(([lang, data]: [string, any]) => `
            <p><strong>${LANGUAGE_NAMES[lang]}:</strong> ${data.changes.length} improvements</p>
          `).join('')}
          
          <p>You can review all changes in your downloaded files, where they're highlighted for your approval.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p>Questions? Just reply to this email.</p>
          
          <p>Happy publishing!<br>The TranslateABook Team</p>
        </div>
      `,
    })

    return NextResponse.json({ 
      success: true, 
      translations,
      message: 'Translation complete and email sent'
    })

  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    )
  }
}

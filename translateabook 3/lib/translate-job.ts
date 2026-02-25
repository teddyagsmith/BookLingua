import { inngest } from '@/lib/inngest'
import { supabaseAdmin } from '@/lib/supabase'
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

const LANGUAGE_SETTINGS: Record<string, string> = {
  es: 'Use Latin American Spanish as the default, but maintain universal readability. Use "tú" for informal address.',
  fr: 'Use standard French (France) with clear, modern phrasing.',
  de: 'Use standard German (Hochdeutsch) with clear sentence structure.',
  pt: 'Use Brazilian Portuguese as the default for wider readability.',
}

// Main translation job - triggered automatically after payment
export const translateBook = inngest.createFunction(
  { 
    id: 'translate-book',
    name: 'Translate Book',
    retries: 3,
  },
  { event: 'book/translate.requested' },
  async ({ event, step }) => {
    const { orderId } = event.data

    // Step 1: Get order details from database
    const order = await step.run('get-order', async () => {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()
      
      if (error) throw new Error(`Order not found: ${error.message}`)
      return data
    })

    // Step 2: Get the original file content
    const fileContent = await step.run('get-file-content', async () => {
      const { data, error } = await supabaseAdmin
        .from('files')
        .select('content')
        .eq('order_id', orderId)
        .eq('type', 'original')
        .single()
      
      if (error) throw new Error(`Original file not found: ${error.message}`)
      return data.content
    })

    // Step 3: Update order status to processing
    await step.run('update-status-processing', async () => {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'processing' })
        .eq('id', orderId)
    })

    const languages = order.languages as string[]
    const translations: Record<string, any> = {}

    // Step 4: Translate to each language
    for (const langCode of languages) {
      const langName = LANGUAGE_NAMES[langCode]
      const langSettings = LANGUAGE_SETTINGS[langCode]

      // Pass 1: Translation
      const translatedText = await step.run(`translate-${langCode}`, async () => {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100000,
          messages: [
            {
              role: 'user',
              content: `You are a professional literary translator specializing in ${order.genre || 'general'} books.

Translate the following book into ${langName}.

LANGUAGE SETTINGS:
${langSettings}

IMPORTANT GUIDELINES:
- Preserve the author's unique voice and writing style
- Maintain the original formatting, paragraph structure, and layout
- Keep proper nouns and names consistent throughout
- Handle technical terms accurately - keep specialized terminology where appropriate
- Ensure the translation reads naturally to native ${langName} speakers, not like a translation
- Adapt idioms and expressions to equivalent ones in ${langName}
- Maintain the same tone (formal/informal) as the original

BOOK TITLE: ${order.book_title}
AUTHOR: ${order.author_name}
GENRE: ${order.genre || 'General'}

${order.special_instructions ? `AUTHOR'S SPECIAL INSTRUCTIONS:\n${order.special_instructions}\n` : ''}

TEXT TO TRANSLATE:
${fileContent}

Provide ONLY the translation, no explanations or notes.`,
            },
          ],
        })

        return response.content[0].type === 'text' ? response.content[0].text : ''
      })

      // Pass 2: Editorial Review
      const editorialResult = await step.run(`editorial-${langCode}`, async () => {
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-20250514',
          max_tokens: 100000,
          messages: [
            {
              role: 'user',
              content: `You are a senior ${langName} editor specializing in ${order.genre || 'general'} books.

Review this translation and make improvements for natural flow, cultural accuracy, and readability.

LANGUAGE SETTINGS:
${langSettings}

ORIGINAL ENGLISH:
${fileContent.slice(0, 30000)}

TRANSLATION TO REVIEW:
${translatedText.slice(0, 30000)}

For each improvement you make:
1. Ensure it sounds natural to native speakers
2. Adapt cultural references appropriately
3. Improve flow and readability
4. Fix any grammatical issues

IMPORTANT: Mark ALL changes you make by wrapping them in [[HIGHLIGHT]] tags like this:
Original phrase → [[HIGHLIGHT]]Improved phrase[[/HIGHLIGHT]]

This allows the author to see exactly what was changed.

Respond with the full edited translation with highlights.`,
            },
          ],
        })

        return response.content[0].type === 'text' ? response.content[0].text : translatedText
      })

      translations[langCode] = {
        translated: translatedText,
        edited: editorialResult,
      }

      // Save translation to database
      await step.run(`save-translation-${langCode}`, async () => {
        await supabaseAdmin.from('files').insert({
          order_id: orderId,
          type: 'translated',
          language: langCode,
          content: editorialResult,
          original_content: translatedText,
        })
      })
    }

    // Step 5: Update order status to completed
    await step.run('update-status-completed', async () => {
      await supabaseAdmin
        .from('orders')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', orderId)
    })

    // Step 6: Send completion email to customer
    await step.run('send-completion-email', async () => {
      const downloadLinks = languages.map(lang => ({
        language: LANGUAGE_NAMES[lang],
        url: `${process.env.NEXT_PUBLIC_APP_URL}/download/${orderId}/${lang}`,
      }))

      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.com>',
        to: order.email,
        subject: `Your translations are ready: ${order.book_title} 🎉`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #7c3aed;">Your translations are ready! 📚</h1>
            
            <p>Hi ${order.author_name},</p>
            
            <p>Great news! Your translations for <strong>${order.book_title}</strong> are complete and ready for download.</p>
            
            <div style="background: #f5f3ff; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Download Your Translations</h3>
              ${downloadLinks.map(link => `
                <p style="margin: 10px 0;">
                  <strong>${link.language}:</strong>
                  <a href="${link.url}" style="color: #7c3aed; text-decoration: none;"> Download File →</a>
                </p>
              `).join('')}
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">
                <strong>📝 Review your changes:</strong> Editorial improvements are highlighted in yellow in your documents. Review each change to ensure it matches your vision.
              </p>
            </div>
            
            <p>Download links expire in 7 days. Need them resent? Just reply to this email.</p>
            
            <p>Happy publishing!<br>The BookLingua Team</p>
          </div>
        `,
      })
    })

    // Step 7: Notify admin
    await step.run('notify-admin', async () => {
      await resend.emails.send({
        from: 'BookLingua <orders@booklingua.com>',
        to: process.env.ADMIN_EMAIL!,
        subject: `✅ Translation Complete: ${order.book_title}`,
        html: `
          <h2>Translation Completed!</h2>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Customer:</strong> ${order.author_name} (${order.email})</p>
          <p><strong>Book:</strong> ${order.book_title}</p>
          <p><strong>Languages:</strong> ${languages.map(l => LANGUAGE_NAMES[l]).join(', ')}</p>
          <p><strong>Status:</strong> ✅ Completed and delivered</p>
        `,
      })
    })

    return { success: true, orderId, languages }
  }
)

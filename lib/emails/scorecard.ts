const SCORECARD_URL = 'https://booklingua.io/scorecard?utm_source=scorecard_email&utm_medium=email&utm_campaign=language_scorecard'
const LOGO_URL = 'https://booklingua.io/logo-doc-hq.png'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] || character))

export function scorecardEmailHtml(firstName?: string | null, marketingConsent = false) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hello,'
  const consentCopy = marketingConsent
    ? 'You also opted in to BookLingua publishing tips and subscriber offers.'
    : 'You have not been subscribed to ongoing marketing emails.'

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#F7EFE4;color:#2B2733;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your free BookLingua language scorecard is ready.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7EFE4;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#FFFFFF;border:1px solid #E8E0D8;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:28px 34px 22px;text-align:center;background:#EBE6F4;">
            <img src="${LOGO_URL}" width="230" alt="BookLingua" style="display:block;width:230px;max-width:80%;height:auto;margin:0 auto;">
          </td></tr>
          <tr><td style="padding:34px 38px 10px;">
            <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">${greeting}</p>
            <p style="margin:0 0 10px;color:#7B6CA8;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Your free scorecard is ready</p>
            <h1 style="margin:0 0 18px;color:#1A1A1A;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;font-weight:500;">Which language should you translate your book into first?</h1>
            <p style="margin:0 0 24px;color:#4B4652;font-size:17px;line-height:1.7;">Use the three-minute scorecard to compare German, Spanish, French, Italian and Portuguese using your genre, existing reader signals and launch readiness.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#7B6CA8" style="border-radius:10px;">
              <a href="${SCORECARD_URL}" style="display:inline-block;padding:15px 24px;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;">Open your scorecard&nbsp; →</a>
            </td></tr></table>
            <p style="margin:24px 0 0;color:#6B6570;font-size:14px;line-height:1.65;">The scorecard is a planning tool designed to help you identify the strongest market to investigate first—not a promise of sales.</p>
          </td></tr>
          <tr><td style="padding:22px 38px 34px;">
            <div style="height:1px;background:#E8E0D8;margin-bottom:22px;"></div>
            <p style="margin:0 0 8px;color:#4B4652;font-size:14px;line-height:1.6;">Warmly,<br><strong>The BookLingua team</strong></p>
            <p style="margin:0;color:#817A86;font-size:12px;line-height:1.6;">You received this service email because you requested the BookLingua scorecard. ${consentCopy}</p>
          </td></tr>
        </table>
        <p style="margin:18px 0 0;color:#817A86;font-size:12px;">© BookLingua · <a href="https://booklingua.io/privacy" style="color:#5E5090;">Privacy policy</a></p>
      </td></tr>
    </table>
  </body>
</html>`
}

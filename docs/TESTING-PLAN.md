# BookLingua — Pre-Launch Testing Plan

Run through these in order. Use the `TESTDRIVE` voucher code (95% off) for real payment tests so you're only charged ~$1.

---

## 1. Pages & Navigation

- [ ] `booklingua.io` loads correctly — hero, pricing, FAQ all visible
- [ ] `booklingua.io/examples` loads — check all 3 tabs (Translation, Translation Notes, Launch Pack)
- [ ] `booklingua.io/publishers` loads — check both "Get in Touch" email links work
- [ ] Banner/announcement bar at top visible
- [ ] Mobile view looks good on your phone (check homepage + checkout flow)

---

## 2. File Upload

- [ ] Upload a **DOCX** file — confirm it's accepted
- [ ] Upload an **EPUB** file — confirm it's accepted
- [ ] Upload a **TXT** file — confirm it's accepted
- [ ] Upload a **PDF** file — confirm it's accepted
- [ ] Try uploading a file > 50MB — should show an error
- [ ] Try uploading an unsupported format (e.g. .jpg) — should show an error

---

## 3. Book Details Form

- [ ] Genre dropdown works — all options selectable
- [ ] Select **Romance** → heat level buttons appear (Sweet / Steamy / Explicit)
- [ ] Select a non-romance genre → heat level does NOT appear
- [ ] Genre tip chips appear when a genre is selected (click one, it populates the instructions field)
- [ ] Special instructions field accepts text

---

## 4. Language Selection & Pricing

- [ ] Select 1 language — price shows correctly (no discount)
- [ ] Select 2 languages — 12% bundle discount applied
- [ ] Select 3 languages — 25% discount applied
- [ ] Select all 6 languages — 40% discount applied
- [ ] Deselecting a language updates the price immediately

---

## 5. Upsells

- [ ] **Launch Strategy Pack** appears and can be toggled on/off
- [ ] Price updates when Launch Pack is added ($29 for 1 language, $49 for 2+)
- [ ] **MRR Romance Shoutout** only appears when Romance/Erotica is selected as genre
- [ ] MRR Shoutout price shows $69

---

## 6. Voucher Codes

Test each code:
- [ ] `LAUNCH20` — applies 20% discount ✓
- [ ] `FIRST50` — applies $50 fixed discount ✓
- [ ] `FRIEND10` — applies 10% discount ✓
- [ ] `AUTHOR25` — applies 25% discount ✓
- [ ] `TESTDRIVE` — applies 95% discount ✓
- [ ] Invalid code (e.g. `BADCODE`) — shows error message ✓
- [ ] Voucher + bundle discount stack correctly ✓

---

## 7. Checkout & Payment

Use the `TESTDRIVE` code to reduce cost to ~$5.

- [ ] Click "Get Started" / proceed to checkout
- [ ] Stripe checkout page loads correctly
- [ ] Order summary shows correct items, languages, and price
- [ ] Complete payment with a real card
- [ ] Redirected to `/success` page after payment
- [ ] Success page shows order ID and next steps

---

## 8. Order Confirmation Email

- [ ] Confirmation email arrives within 1–2 minutes of payment
- [ ] Sent from `orders@booklingua.io`
- [ ] Contains order details
- [ ] Not in spam folder

---

## 9. Translation Job

- [ ] Inngest job triggers after webhook fires (check [app.inngest.com](https://app.inngest.com))
- [ ] Job completes without errors
- [ ] Translated file delivered via email (allow up to 3 hours for a full book; use a short TXT for testing)

**Tip:** For a fast test, upload a short TXT file (500–1000 words). Translation should complete in under 10 minutes.

---

## 10. Download

- [ ] Download link in email works
- [ ] File downloads in the correct format
- [ ] Translated content is in the correct language
- [ ] Translation Notes document is included

---

## 11. Edge Cases

- [ ] Try placing an order without uploading a file — should be blocked
- [ ] Try proceeding without selecting a language — should be blocked
- [ ] Try opening a download link twice — confirm it still works (or shows an appropriate message if expired)

---

## Quick Test Checklist (Smoke Test)

For a fast daily check, run just these:

- [ ] Homepage loads ✓
- [ ] Upload a file ✓
- [ ] Select 1 language + TESTDRIVE code ✓
- [ ] Complete payment ✓
- [ ] Confirmation email received ✓
- [ ] Translation delivered ✓

---

## Reporting Issues

Log any bugs in the GitHub repo: https://github.com/teddyagsmith/BookLingua/issues

Include:
- Steps to reproduce
- Expected vs actual behaviour
- Screenshot if relevant

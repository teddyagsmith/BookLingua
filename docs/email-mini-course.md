# BookLingua "Launch in Europe" Email Mini-Course

## Overview
5-email nurture sequence teaching indie authors how to launch translated books in European markets. Doubles as ad creative and social content.

## Email 1: Welcome + The European Opportunity (Day 0)
**Subject:** Welcome! Your European readers are waiting 🌍

**Hook:** Only 4% of indie books ever get translated. Here's why that's your advantage.

**Content:**
- Welcome & course preview (5 emails over 2 weeks)
- The stat: 96% of self-published books never leave English
- The opportunity: Germany alone buys €3B+ in books yearly
- Promise: By the end, you'll know exactly how to launch in Europe
- CTA: Hit reply — what's your biggest fear about translation?

---

## Email 2: Market Research (Day 3)
**Subject:** Which European market should you target first?

**Hook:** Not all markets are equal. Here's the data.

**Content:**
- Germany: Biggest market, romance/thriller strong, KDP available
- France: Literary fiction, high prices, KDP available  
- Spain: Growing fast, romance huge, KDP available
- Italy: Smaller but underserved, opportunity
- Tool: Amazon.es/.de/.fr bestseller list analysis
- CTA: Check your genre's bestsellers in each market

**Ad angle:** Screenshot Amazon bestseller differences across markets

---

## Email 3: The Translation Decision (Day 6)
**Subject:** Human vs AI translation: What the data actually says

**Hook:** I tested both. Here's what worked.

**Content:**
- Traditional: $5-10K, 6 weeks, quality varies
- AI (raw): Fast, cheap, but readers notice
- AI + Editorial: 95% of quality at 10% of cost
- Reader blind test results
- When to use each approach
- CTA: See a real before/after editorial review

**Ad angle:** Side-by-side comparison image

---

## Email 4: Launch Strategy (Day 10)
**Subject:** The 90-day European launch playbook

**Hook:** Most authors translate then hope. Here's a system.

**Content:**
- Month 1: Translation + beta readers in target market
- Month 2: ARCs, category research, metadata optimization
- Month 3: Launch week tactics, ads, newsletter swaps
- Key: Start building local presence before launch
- CTA: Download the full timeline checklist

**Ad angle:** Infographic of the 90-day timeline

---

## Email 5: The First Sale (Day 14)
**Subject:** Your book is live in Europe. Now what?

**Hook:** Translation was step one. Here's how to keep selling.

**Content:**
- Box sets: Bundle languages for higher per-sale value
- Audio: European audiobook markets exploding
- Sequels: Translated series sell 3x better than standalones
- Ads: Low CPC in non-English markets right now
- Success story: Author who went from 0 to €2K/month in Germany
- CTA: Ready to translate? Use code LAUNCH20 for 20% off

**Ad angle:** Testimonial + revenue screenshot

---

## Implementation Notes

### Tech Setup
1. Add `welcome_sequence` column to email_subscribers table
2. Store `sequence_day` (0, 3, 6, 10, 14)
3. Cron job to send daily at 10am CET
4. Track opens/clicks per email

### Content Repurposing
Each email becomes:
- 1 Twitter thread
- 1 LinkedIn post
- 1 Facebook ad creative
- 1 TikTok/Reel script

### Segmentation
- Tag by genre (romance vs thriller vs literary)
- Tag by interest (ready now vs researching)
- Separate track for publishers vs indie authors

### Metrics to Track
- Open rates by email
- Click-through to site
- Replies/engagement
- Conversion to paid order
- Unsubscribe rate (<2% target)
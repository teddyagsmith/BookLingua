# BookLingua Email Mini-Course — Supabase Setup

## Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your BookLingua project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New query"**

## Step 2: Run This SQL

Copy and paste this entire block, then click **Run**:

```sql
-- Add welcome sequence tracking to email_subscribers
ALTER TABLE email_subscribers 
ADD COLUMN IF NOT EXISTS welcome_sequence_day INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_email_subject TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_subscribers_sequence 
ON email_subscribers(welcome_sequence_day, last_email_sent_at)
WHERE welcome_sequence_day IS NOT NULL;

-- Ensure email uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscribers_email_unique 
ON email_subscribers(email);
```

You should see green checkmarks. That's it.

## Step 3: Verify It Worked

Run this query in a new SQL Editor tab:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'email_subscribers';
```

You should see `welcome_sequence_day`, `last_email_sent_at`, `last_email_subject`, and `subscribed_at` in the list.

## What This Does

- Tracks which email each subscriber has received (Day 0, 3, 6, 10, or 14)
- Records when their last email was sent
- Lets us query "who needs Day 3 today?" automatically

## Next Step

Once this is done, I'll build the cron job to auto-send emails on schedule.

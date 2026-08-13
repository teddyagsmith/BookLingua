-- QUARANTINED HISTORICAL MIGRATION. Hosted state already represents this schema.

ALTER TABLE email_subscribers 
ADD COLUMN IF NOT EXISTS welcome_sequence_day INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_email_subject TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for efficient querying of subscribers who need emails
CREATE INDEX IF NOT EXISTS idx_email_subscribers_sequence 
ON email_subscribers(welcome_sequence_day, last_email_sent_at)
WHERE welcome_sequence_day IS NOT NULL;

-- Create index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscribers_email_unique 
ON email_subscribers(email);

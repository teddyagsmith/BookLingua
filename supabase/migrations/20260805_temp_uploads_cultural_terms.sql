-- Add pre-payment cultural terms review columns to temp_uploads
ALTER TABLE temp_uploads
ADD COLUMN IF NOT EXISTS cultural_terms JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS glossary_decisions JSONB DEFAULT NULL;

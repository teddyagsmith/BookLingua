-- Add email column to temp_uploads for abandoned checkout recovery
ALTER TABLE temp_uploads ADD COLUMN IF NOT EXISTS email text;

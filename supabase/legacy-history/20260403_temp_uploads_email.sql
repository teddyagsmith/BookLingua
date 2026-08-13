-- QUARANTINED HISTORICAL MIGRATION. Hosted catalog does not include this column.
ALTER TABLE temp_uploads ADD COLUMN IF NOT EXISTS email text;

-- QUARANTINED HISTORICAL MIGRATION. Hosted state already represents this schema.
ALTER TABLE temp_uploads
ADD COLUMN IF NOT EXISTS cultural_terms JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS glossary_decisions JSONB DEFAULT NULL;

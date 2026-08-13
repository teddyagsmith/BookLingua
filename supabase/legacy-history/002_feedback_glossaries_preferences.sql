-- QUARANTINED HISTORICAL MIGRATION. Not approved for hosted replay.
-- ─── order_feedback ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    UUID REFERENCES orders(id) NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  language    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── genre_glossaries ─────────────────────────────────────────────────────────
-- Approved term translations per genre + language.
-- Injected into the translation prompt so the AI uses consistent terminology.
CREATE TABLE IF NOT EXISTS genre_glossaries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  genre       TEXT NOT NULL,           -- e.g. 'romance', 'fantasy', 'thriller'
  language    TEXT NOT NULL,           -- e.g. 'fr', 'es-es'
  source_term TEXT NOT NULL,           -- English term
  target_term TEXT NOT NULL,           -- Approved translation
  notes       TEXT,                    -- Optional: context / usage guidance
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(genre, language, source_term)
);

-- Seed a few Romance/steamy glossary entries as a starting point
INSERT INTO genre_glossaries (genre, language, source_term, target_term, notes) VALUES
  ('romance', 'fr', 'member',    'membre',         'Use consistently — author preference'),
  ('romance', 'fr', 'heat',      'désir',          'Prefer désir over chaleur in intimate scenes'),
  ('romance', 'fr', 'billionaire','milliardaire',  NULL),
  ('romance', 'es-es', 'member', 'miembro',        'Use consistently — author preference'),
  ('romance', 'es-latam', 'member', 'miembro',     'Use consistently — author preference'),
  ('romance', 'de', 'member',    'Glied',          'Use consistently in intimate scenes'),
  ('romance', 'pt-br', 'member', 'membro',         NULL),
  ('romance', 'pt-pt', 'member', 'membro',         NULL)
ON CONFLICT (genre, language, source_term) DO NOTHING;

-- ─── author_preferences ──────────────────────────────────────────────────────
-- Stores style + terminology preferences per author email.
-- Populated after first order; injected into prompts on subsequent orders.
CREATE TABLE IF NOT EXISTS author_preferences (
  id                           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email                        TEXT NOT NULL UNIQUE,
  preferred_register           TEXT,          -- e.g. 'formal', 'informal', 'intimate'
  terminology_notes            TEXT,          -- e.g. 'always use member, never vary'
  style_notes                  TEXT,          -- e.g. 'fast-paced, short sentences'
  previous_special_instructions TEXT[],       -- history of special_instructions from past orders
  last_updated                 TIMESTAMPTZ DEFAULT NOW()
);

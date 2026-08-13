-- DISPOSABLE STAGING/CI BOOTSTRAP ONLY. NEVER APPLY TO HOSTED PRODUCTION.
-- This restores the checked-in baseline schema before incremental migrations.
-- Do not commit or apply to hosted environments.

CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  email TEXT NOT NULL,
  author_name TEXT NOT NULL,
  book_title TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  tier TEXT NOT NULL,
  file_format TEXT NOT NULL,
  languages JSONB NOT NULL,
  genre TEXT,
  upsells JSONB DEFAULT '[]',
  special_instructions TEXT,
  amount_paid DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  download_token TEXT
);

CREATE TABLE files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT,
  original_content TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Present in production but its original migration is not checked into this
-- repository. The shape is reconstructed from the legacy application writes.
CREATE TABLE translation_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  lang_code TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  pass TEXT NOT NULL,
  content TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id, lang_code, chunk_index, pass)
);

CREATE TABLE temp_uploads (
  session_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  content TEXT,
  word_count INTEGER NOT NULL,
  cultural_terms JSONB DEFAULT NULL,
  glossary_decisions JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required by the misdated 20250416 migration; the checked-in create-table
-- migrations are dated 20260401/20260421 and therefore run too late locally.
CREATE TABLE email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'unknown',
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_files_order_id ON files(order_id);
CREATE INDEX idx_files_type_language ON files(type, language);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to files" ON files
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to temp_uploads" ON temp_uploads
  FOR ALL USING (auth.role() = 'service_role');

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role can manage uploads" ON storage.objects
  FOR ALL USING (bucket_id = 'uploads' AND auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION cleanup_temp_uploads()
RETURNS void AS $$
BEGIN
  DELETE FROM temp_uploads
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

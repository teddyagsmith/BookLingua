-- BookLingua Database Schema
-- Run this in your Supabase SQL Editor

-- Orders table
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  email TEXT NOT NULL,
  author_name TEXT NOT NULL,
  book_title TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  tier TEXT NOT NULL, -- 'small', 'medium', 'large'
  file_format TEXT NOT NULL, -- '.epub', '.pdf', '.docx', '.txt'
  languages JSONB NOT NULL, -- ['es', 'fr', 'de', 'pt']
  genre TEXT,
  upsells JSONB DEFAULT '[]',
  special_instructions TEXT,
  amount_paid DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Files table (original and translated)
CREATE TABLE files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'original', 'translated'
  language TEXT NOT NULL, -- 'en', 'es', 'fr', 'de', 'pt'
  content TEXT, -- For text-based content
  original_content TEXT, -- For translated files, the pre-editorial version
  file_url TEXT, -- For binary files stored in Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Temporary uploads (before checkout)
CREATE TABLE temp_uploads (
  session_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  content TEXT,
  word_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_files_order_id ON files(order_id);
CREATE INDEX idx_files_type_language ON files(type, language);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_uploads ENABLE ROW LEVEL SECURITY;

-- Policies (allow service role full access)
CREATE POLICY "Service role has full access to orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to files" ON files
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to temp_uploads" ON temp_uploads
  FOR ALL USING (auth.role() = 'service_role');

-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for uploads bucket
CREATE POLICY "Service role can manage uploads" ON storage.objects
  FOR ALL USING (bucket_id = 'uploads' AND auth.role() = 'service_role');

-- Function to clean up old temp uploads (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_temp_uploads()
RETURNS void AS $$
BEGIN
  DELETE FROM temp_uploads
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

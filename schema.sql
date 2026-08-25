-- ══════════════════════════════════════════════════════════════
-- AMES DE BRILLIANTE — Supabase schema
-- Run this in the Supabase SQL Editor to set up all tables
-- ══════════════════════════════════════════════════════════════

-- ── Traders ──
CREATE TABLE IF NOT EXISTS traders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  licence TEXT NOT NULL DEFAULT '',
  portal_code TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  company TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  licence_photo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Reports ──
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  report_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Models ──
CREATE TABLE IF NOT EXISTS models (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  portal_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  monthly_video_quota INTEGER NOT NULL DEFAULT 30,
  monthly_base_fee NUMERIC NOT NULL DEFAULT 200,
  commission_rate NUMERIC NOT NULL DEFAULT 0.005,
  payment_method TEXT NOT NULL DEFAULT '',
  payment_details TEXT NOT NULL DEFAULT '',
  total_paid NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Videos ──
CREATE TABLE IF NOT EXISTS videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  video_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  stone_id TEXT REFERENCES stones(id),
  published INTEGER NOT NULL DEFAULT 0,
  model_id BIGINT REFERENCES models(id),
  status TEXT NOT NULL DEFAULT 'Live',
  tap_count INTEGER NOT NULL DEFAULT 0,
  reserve_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  sales_value NUMERIC NOT NULL DEFAULT 0,
  commission_earned NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Stone Status Log ──
CREATE TABLE IF NOT EXISTS stone_status_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stone_id TEXT NOT NULL REFERENCES stones(id),
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Requests ──
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL,
  type TEXT NOT NULL,
  shape TEXT NOT NULL,
  carat_min TEXT NOT NULL DEFAULT '',
  carat_max TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  clarity TEXT NOT NULL,
  certification TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  kp_licence TEXT NOT NULL DEFAULT '',
  kp_country TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0,
  declaration INTEGER NOT NULL DEFAULT 0,
  consent_timestamp TEXT NOT NULL DEFAULT '',
  mandate TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  offer_text TEXT NOT NULL DEFAULT '',
  offer_timestamp TEXT NOT NULL DEFAULT ''
);

-- ── Stones ──
CREATE TABLE IF NOT EXISTS stones (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  stone_type TEXT NOT NULL DEFAULT 'polished',
  shape TEXT NOT NULL,
  carat REAL NOT NULL,
  color TEXT NOT NULL,
  clarity TEXT NOT NULL DEFAULT '',
  cut TEXT NOT NULL DEFAULT '',
  certification TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  crystal_form TEXT NOT NULL DEFAULT '',
  clarity_notes TEXT NOT NULL DEFAULT '',
  kp_status INTEGER NOT NULL DEFAULT 0,
  price REAL,
  status TEXT NOT NULL DEFAULT 'Available',
  photo TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'Own stock',
  trader_id BIGINT REFERENCES traders(id),
  commission REAL NOT NULL DEFAULT 0,
  sale_price REAL,
  photo_path TEXT,
  listing_category TEXT NOT NULL DEFAULT 'Polished',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Orders (Reserve flow) ──
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stone_id TEXT NOT NULL REFERENCES stones(id),
  stone_ref TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_whatsapp TEXT NOT NULL DEFAULT '',
  price REAL,
  status TEXT NOT NULL DEFAULT 'Reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_stones_status ON stones(status);
CREATE INDEX IF NOT EXISTS idx_stones_source ON stones(source);
CREATE INDEX IF NOT EXISTS idx_stones_trader ON stones(trader_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);

-- ── Photo storage bucket ──
-- Run this via Supabase dashboard > Storage > New bucket:
--   Name: stone-photos
--   Public: true
--   File size limit: 5 MB
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Or via SQL (Supabase v2):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stone-photos',
  'stone-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies for stone-photos bucket ──
-- Allow public read access
CREATE POLICY IF NOT EXISTS "Public read for stone photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stone-photos');

-- Allow authenticated insert/update
CREATE POLICY IF NOT EXISTS "Authenticated upload for stone photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stone-photos' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Authenticated update for stone photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'stone-photos' AND auth.role() = 'authenticated');

create table if not exists pricing_estimate_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  word_count integer not null check (word_count between 1 and 150000),
  languages jsonb not null,
  price_tier text not null check (price_tier in ('small', 'medium', 'large')),
  base_price numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  discount_percent integer not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  source text not null default 'pricing_calculator',
  page_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  marketing_consent boolean not null default false,
  marketing_consented_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pricing_estimate_leads_email on pricing_estimate_leads(email);
create index if not exists idx_pricing_estimate_leads_created_at on pricing_estimate_leads(created_at desc);
create index if not exists idx_pricing_estimate_leads_utm_campaign on pricing_estimate_leads(utm_campaign);
alter table pricing_estimate_leads enable row level security;
create policy "Service role manages pricing estimate leads" on pricing_estimate_leads for all to service_role using (true) with check (true);

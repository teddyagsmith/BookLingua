create table if not exists scorecard_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  genre text,
  source text not null default 'meta_instant_form',
  marketing_consent boolean not null default false,
  marketing_consented_at timestamptz,
  meta_lead_id text,
  meta_form_id text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz,
  provider_message_id text,
  submission_count integer not null default 1,
  first_submitted_at timestamptz not null default now(),
  last_submitted_at timestamptz not null default now(),
  follow_up_status text not null default 'new' check (follow_up_status in ('new', 'contacted', 'qualified', 'converted', 'not_interested')),
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_scorecard_leads_email_lower on scorecard_leads (lower(email));
create unique index if not exists idx_scorecard_leads_meta_lead_id on scorecard_leads (meta_lead_id) where meta_lead_id is not null;
create index if not exists idx_scorecard_leads_created_at on scorecard_leads (created_at desc);
create index if not exists idx_scorecard_leads_campaign on scorecard_leads (meta_campaign_id, utm_campaign);

alter table scorecard_leads enable row level security;
create policy "Service role manages scorecard leads" on scorecard_leads for all to service_role using (true) with check (true);


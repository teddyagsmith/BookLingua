alter table email_subscribers
  add column if not exists marketing_consent boolean not null default true,
  add column if not exists marketing_consented_at timestamptz,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists mailerlite_sync_status text not null default 'pending',
  add column if not exists mailerlite_synced_at timestamptz,
  add column if not exists mailerlite_sync_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table email_subscribers
  drop constraint if exists email_subscribers_mailerlite_sync_status_check;

alter table email_subscribers
  add constraint email_subscribers_mailerlite_sync_status_check
  check (mailerlite_sync_status in ('pending', 'synced', 'failed'));

create index if not exists idx_email_subscribers_mailerlite_retry
  on email_subscribers (mailerlite_sync_status, updated_at)
  where marketing_consent = true and mailerlite_sync_status <> 'synced';

alter table scorecard_leads
  add column if not exists mailerlite_sync_status text not null default 'pending',
  add column if not exists mailerlite_synced_at timestamptz,
  add column if not exists mailerlite_sync_error text;

alter table scorecard_leads
  drop constraint if exists scorecard_leads_mailerlite_sync_status_check;

alter table scorecard_leads
  add constraint scorecard_leads_mailerlite_sync_status_check
  check (mailerlite_sync_status in ('pending', 'synced', 'failed'));

create index if not exists idx_scorecard_leads_mailerlite_retry
  on scorecard_leads (mailerlite_sync_status, updated_at)
  where marketing_consent = true and mailerlite_sync_status <> 'synced';

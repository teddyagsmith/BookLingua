alter table pricing_estimate_leads
  add column if not exists follow_up_status text not null default 'new'
    check (follow_up_status in ('new', 'contacted', 'qualified', 'converted', 'not_interested')),
  add column if not exists followed_up_at timestamptz;

create index if not exists idx_pricing_estimate_leads_follow_up_status
  on pricing_estimate_leads(follow_up_status, created_at desc);

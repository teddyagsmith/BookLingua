alter table temp_uploads
  add column if not exists marketing_attribution jsonb not null default '{}'::jsonb;

alter table orders
  add column if not exists marketing_attribution jsonb not null default '{}'::jsonb;

create index if not exists idx_orders_marketing_campaign
  on orders ((marketing_attribution->>'utm_campaign'));

comment on column temp_uploads.marketing_attribution is
  'First attributable browser touch persisted before checkout.';

comment on column orders.marketing_attribution is
  'First attributable browser touch carried through Stripe checkout.';

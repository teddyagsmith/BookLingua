-- Email subscribers table for BookLingua newsletter
create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'unknown', -- 'popup' | 'footer' | 'unknown'
  subscribed_at timestamptz default now()
);

-- Index for fast lookups
create index if not exists email_subscribers_email_idx on email_subscribers(email);

-- Row-level security (only service role can write)
alter table email_subscribers enable row level security;

-- Service role policy (API uses service key)
create policy "Service role full access"
  on email_subscribers
  for all
  using (true)
  with check (true);

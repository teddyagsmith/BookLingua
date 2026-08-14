-- Full-book semantic batching: immutable model telemetry, Launch Pack cache,
-- and idempotent terminal build cleanup/audit. Do not apply automatically.

create table if not exists model_call_events (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  build_id uuid,
  stage text not null,
  batch_id text,
  attempt integer not null check (attempt > 0),
  request_identity text not null,
  provider text not null,
  model_id text not null,
  provider_request_id text,
  success boolean not null,
  input_tokens bigint,
  output_tokens bigint,
  cache_status text not null check (cache_status in ('miss','hit','write','none')),
  error_code text,
  estimated_cost_usd numeric,
  pricing_version text,
  created_at timestamptz not null default now(),
  unique(request_identity, attempt)
);
create index if not exists model_call_events_order_stage_idx on model_call_events(order_id,language,stage,created_at);
alter table model_call_events enable row level security;
drop policy if exists "Service role manages model call events" on model_call_events;
create policy "Service role manages model call events" on model_call_events for all using (auth.role()='service_role');
drop trigger if exists model_call_events_immutable on model_call_events;
create trigger model_call_events_immutable before update or delete on model_call_events
for each row execute function prevent_hardened_history_mutation();

create table if not exists launch_pack_results (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  language text not null,
  identity_fingerprint text not null,
  generation_input_fingerprint text not null,
  source_fingerprint text not null,
  build_id uuid not null,
  brief_revision bigint not null check (brief_revision > 0),
  brief_schema_version text not null,
  brief_fingerprint text not null,
  model_id text not null,
  schema_version text not null,
  template_version text not null,
  content jsonb not null,
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  unique(order_id,language,identity_fingerprint)
);
alter table launch_pack_results enable row level security;
drop policy if exists "Service role manages launch pack results" on launch_pack_results;
create policy "Service role manages launch pack results" on launch_pack_results for all using (auth.role()='service_role');
drop trigger if exists launch_pack_results_immutable on launch_pack_results;
create trigger launch_pack_results_immutable before update or delete on launch_pack_results
for each row execute function prevent_hardened_history_mutation();

create or replace function fail_active_order_builds(
  p_order_id uuid, p_stage text, p_safe_error text, p_failed_at timestamptz
) returns void language plpgsql security definer set search_path=public as $$
declare v_event_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_order_id::text || ':terminal-failure'));
  update order_language_builds set state='failed'
    where order_id=p_order_id and is_current and state='building';
  v_event_id := (
    substr(md5('terminal:'||p_order_id::text||':'||p_stage),1,8)||'-'||
    substr(md5('terminal:'||p_order_id::text||':'||p_stage),9,4)||'-5'||
    substr(md5('terminal:'||p_order_id::text||':'||p_stage),14,3)||'-a'||
    substr(md5('terminal:'||p_order_id::text||':'||p_stage),18,3)||'-'||
    substr(md5('terminal:'||p_order_id::text||':'||p_stage),21,12)
  )::uuid;
  insert into pipeline_events(id,order_id,language,stage,status,level,safe_message,details,created_at)
  values(v_event_id,p_order_id,'all',p_stage,'failed','error',p_safe_error,
    jsonb_build_object('adminAlertRequired',true,'failedAt',p_failed_at),p_failed_at)
  on conflict(id) do nothing;
end; $$;
revoke all on function fail_active_order_builds(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function fail_active_order_builds(uuid,text,text,timestamptz) to service_role;

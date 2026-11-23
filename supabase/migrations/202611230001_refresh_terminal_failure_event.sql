-- A second failure of the same order/stage must replace the stale terminal
-- event with the current error code and timestamp. The prior implementation's
-- deterministic event id made later failures invisible after the first one.
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
  on conflict(id) do update set
    safe_message=excluded.safe_message,
    details=excluded.details,
    created_at=excluded.created_at;
end; $$;
revoke all on function fail_active_order_builds(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function fail_active_order_builds(uuid,text,text,timestamptz) to service_role;

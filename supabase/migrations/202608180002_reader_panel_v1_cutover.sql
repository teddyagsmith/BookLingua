insert into pipeline_cutovers(version,pipeline_version,notes)
values('reader-panel-v1','semantic-v2','Reader Panel applies only to orders created after this production cutover; existing review-ready orders retain their original delivery path.')
on conflict(version) do nothing;

create or replace function reader_panel_delivery_authorized(p_order_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_created_at timestamptz;
  v_cutover_at timestamptz;
  v_languages jsonb;
  v_missing integer;
begin
  select created_at,languages into v_created_at,v_languages from orders where id=p_order_id;
  if v_created_at is null or v_languages is null then return false; end if;
  select cutover_at into v_cutover_at from pipeline_cutovers where version='reader-panel-v1';
  if v_cutover_at is null then return false; end if;
  if v_created_at < v_cutover_at then return true; end if;
  with required as (
    select jsonb_array_elements_text(v_languages) language
  ), builds as (
    select language,id from order_language_builds where order_id=p_order_id and is_current
  ), reviews as (
    select r.language
    from reader_panel_requests r
    join builds b on b.language=r.language and b.id=r.build_id
    where r.order_id=p_order_id and r.state in('reader_review_pass','reader_review_pass_with_notes')
  )
  select count(*) into v_missing from required l left join reviews r using(language) where r.language is null;
  return jsonb_typeof(v_languages)='array' and jsonb_array_length(v_languages)>0 and v_missing=0;
end;
$$;
revoke all on function reader_panel_delivery_authorized(uuid) from public;
grant execute on function reader_panel_delivery_authorized(uuid) to service_role;

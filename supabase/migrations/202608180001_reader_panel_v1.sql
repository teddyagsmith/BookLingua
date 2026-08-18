create table if not exists reader_panel_requests (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  language text not null, build_id uuid not null, customer_package_version text not null,
  sample_version text not null, request_identity text not null unique,
  state text not null check(state in ('reader_review_pending','reader_review_pass','reader_review_pass_with_notes','reader_review_fail')) default 'reader_review_pending',
  sample_storage_bucket text not null, sample_storage_path text not null, sample_filename text not null,
  sample_sha256 text not null, sample_word_count integer not null check(sample_word_count>0), selection jsonb not null,
  feedback_form_version text not null, email_state text not null check(email_state in ('pending','sending','sent','failed')) default 'pending',
  provider_message_id text, verdict_notes text, feedback_storage_path text, requested_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz not null default now(), unique(order_id,language,build_id,sample_version),
  foreign key(build_id,order_id,language) references order_language_builds(id,order_id,language)
);
alter table reader_panel_requests enable row level security;
create policy "Service role manages reader panel requests" on reader_panel_requests for all to service_role using(true) with check(true);

create or replace function resolve_reader_panel_gate(p_order_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_languages jsonb; v_missing integer; v_status text;
begin
 select languages into v_languages from orders where id=p_order_id for update;
 if v_languages is null then raise exception 'order_not_found'; end if;
 with required as(select jsonb_array_elements_text(v_languages) language), current_builds as(select language,id from order_language_builds where order_id=p_order_id and is_current), reviews as(
  select r.language,r.build_id,r.state from reader_panel_requests r join current_builds b on b.language=r.language and b.id=r.build_id where r.order_id=p_order_id
 ) select count(*) into v_missing from required l left join reviews r using(language) where r.language is null or r.state not in('reader_review_pass','reader_review_pass_with_notes');
 v_status:=case when v_missing=0 then 'ready_for_review' else 'reader_review_pending' end;
 update orders set status=v_status,completed_at=null where id=p_order_id and status not in('delivery_pending','completed');
 return v_status;
end;$$;
revoke all on function resolve_reader_panel_gate(uuid) from public; grant execute on function resolve_reader_panel_gate(uuid) to service_role;

create or replace function record_reader_panel_verdict(p_order_id uuid,p_language text,p_build_id uuid,p_state text,p_notes text default null) returns text language plpgsql security definer set search_path=public as $$
begin
 if p_state not in('reader_review_pass','reader_review_pass_with_notes','reader_review_fail') then raise exception 'invalid_reader_verdict'; end if;
 update reader_panel_requests set state=p_state,verdict_notes=nullif(trim(p_notes),''),reviewed_at=now()
 where order_id=p_order_id and language=p_language and build_id=p_build_id;
 if not found then raise exception 'current_reader_request_not_found'; end if;
 if not exists(select 1 from order_language_builds where id=p_build_id and order_id=p_order_id and language=p_language and is_current) then raise exception 'reader_verdict_build_superseded'; end if;
 if p_state='reader_review_fail' then update orders set status='reader_review_fail' where id=p_order_id and status not in('delivery_pending','completed'); return 'reader_review_fail'; end if;
 return resolve_reader_panel_gate(p_order_id);
end;$$;
revoke all on function record_reader_panel_verdict(uuid,text,uuid,text,text) from public; grant execute on function record_reader_panel_verdict(uuid,text,uuid,text,text) to service_role;

create or replace function reader_panel_delivery_authorized(p_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 with langs as(select jsonb_array_elements_text(languages) language from orders where id=p_order_id), builds as(select language,id from order_language_builds where order_id=p_order_id and is_current), passed as(
  select r.language from reader_panel_requests r join builds b on b.language=r.language and b.id=r.build_id where r.order_id=p_order_id and r.state in('reader_review_pass','reader_review_pass_with_notes')
 ) select (select count(*) from langs)>0 and (select count(*) from langs)=(select count(*) from passed); $$;
revoke all on function reader_panel_delivery_authorized(uuid) from public; grant execute on function reader_panel_delivery_authorized(uuid) to service_role;

-- Harden the existing delivery RPC without relying on a mutable order status alone.
alter function begin_hardened_delivery(uuid) rename to begin_hardened_delivery_without_reader_panel;
create or replace function begin_hardened_delivery(p_order_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if not reader_panel_delivery_authorized(p_order_id) then raise exception 'reader_panel_review_not_passed'; end if;
 return begin_hardened_delivery_without_reader_panel(p_order_id);
end;$$;
revoke all on function begin_hardened_delivery(uuid) from public; grant execute on function begin_hardened_delivery(uuid) to service_role;

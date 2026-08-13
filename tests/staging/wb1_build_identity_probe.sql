\set ON_ERROR_STOP on
begin;
create temporary table build_results(test text, actual text, passed boolean);
insert into orders(id,email,author_name,book_title,word_count,tier,file_format,languages,amount_paid,status)
values('81000000-0000-0000-0000-000000000001','build@example.invalid','Synthetic','Builds',1000,'small','.txt','["fr"]',99,'processing');

select * from begin_order_language_build('81000000-0000-0000-0000-000000000001','fr','82000000-0000-0000-0000-000000000001');
select * from begin_order_language_build('81000000-0000-0000-0000-000000000001','fr','82000000-0000-0000-0000-000000000001');
insert into build_results select 'same-build retry idempotent',string_agg(generation||':'||is_current,',' order by generation),
 count(*)=1 and bool_and(is_current) from order_language_builds where order_id='81000000-0000-0000-0000-000000000001';

select * from begin_order_language_build('81000000-0000-0000-0000-000000000001','fr','82000000-0000-0000-0000-000000000002');
insert into build_results select 'B atomically supersedes A',string_agg(id||':'||state||':'||is_current,',' order by generation),
 count(*)=2 and count(*) filter(where is_current and id='82000000-0000-0000-0000-000000000002')=1
 and count(*) filter(where not is_current and state='superseded' and id='82000000-0000-0000-0000-000000000001')=1
 from order_language_builds where order_id='81000000-0000-0000-0000-000000000001';

-- Delayed A may retain diagnostic history but cannot become authoritative.
insert into validation_reports(id,order_id,language,build_id,stage,validator_version,passed)
values('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','fr','82000000-0000-0000-0000-000000000001','package','1.0',true);
insert into package_manifests(id,order_id,language,build_id,schema_version,status,manifest)
values('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','fr','82000000-0000-0000-0000-000000000001','1.0','pass',
 jsonb_build_object('orderId','81000000-0000-0000-0000-000000000001','language','fr','buildId','82000000-0000-0000-0000-000000000001','status','pass','artifacts','[]'::jsonb,'errors','[]'::jsonb));
insert into build_results values('delayed stale A cannot be authoritative',
 is_authoritative_package_manifest('84000000-0000-0000-0000-000000000001')::text,
 not is_authoritative_package_manifest('84000000-0000-0000-0000-000000000001'));
insert into build_results values('stale A cannot flip gate',resolve_order_package_gate('81000000-0000-0000-0000-000000000001'),
 resolve_order_package_gate('81000000-0000-0000-0000-000000000001')='gate_failed');

-- Invalid ownership is constrained.
do $$ begin begin
 insert into validation_reports(order_id,language,build_id,stage,validator_version,passed)
 values('81000000-0000-0000-0000-000000000001','de','82000000-0000-0000-0000-000000000002','package','1.0',true);
 raise exception 'expected_fk'; exception when foreign_key_violation then null; end; end $$;
insert into build_results values('wrong-language validation rejected','foreign_key_violation',true);

table build_results;
rollback;

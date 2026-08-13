\set ON_ERROR_STOP on
begin;
create temporary table gate_results(test text, expected text, actual text, passed boolean);

create or replace function pg_temp.make_order(p_id uuid, p_languages jsonb)
returns void language plpgsql as $$ begin
  insert into orders(id,email,author_name,book_title,word_count,tier,file_format,languages,amount_paid,status)
  values(p_id,p_id||'@example.invalid','Synthetic','Synthetic',1000,'small','.txt',p_languages,99,'processing');
end $$;

create or replace function pg_temp.make_package(p_order uuid,p_lang text,p_build uuid,p_pass boolean)
returns void language plpgsql as $$
declare v_report uuid := gen_random_uuid(); v_type text; v_artifacts jsonb;
begin
  if not exists(select 1 from order_language_builds where id=p_build) then
    perform begin_order_language_build(p_order,p_lang,p_build);
  end if;
  insert into validation_reports(id,order_id,language,build_id,stage,validator_version,passed)
  values(v_report,p_order,p_lang,p_build,'package','1.0',p_pass);
  foreach v_type in array array['translation_brief','pass1_docx','review_docx','translation_notes',
    'chapter_map_docx','chapter_map_csv','upload_guide','final_docx'] loop
    insert into artifacts(order_id,language,build_id,artifact_type,storage_bucket,storage_path,
      filename,sha256,size_bytes,validation_report_id,validation_status)
    values(p_order,p_lang,p_build,v_type,'booklingua-private-artifacts',
      p_order||'/'||p_lang||'/'||p_build||'/'||v_type,v_type,repeat('a',64),10,v_report,
      case when p_pass then 'pass' else 'fail' end);
  end loop;
  select jsonb_agg(jsonb_build_object(
    'id',id,'buildId',build_id,'type',artifact_type,'required',true,'filename',filename,
    'storageBucket',storage_bucket,'storagePath',storage_path,'sha256',sha256,
    'sizeBytes',size_bytes,'validationStatus',validation_status,'validationReportId',validation_report_id
  ) order by artifact_type) into v_artifacts from artifacts
  where order_id=p_order and language=p_lang and build_id=p_build;
  insert into package_manifests(order_id,language,build_id,schema_version,status,manifest,created_at)
  values(p_order,p_lang,p_build,'1.0',case when p_pass then 'pass' else 'fail' end,
    jsonb_build_object('schemaVersion','1.0','orderId',p_order,'language',p_lang,'buildId',p_build,
      'status',case when p_pass then 'pass' else 'fail' end,'entitlements',jsonb_build_object(
        'sourceFormat','txt','launchPack',false,'dualFormat',false),
      'artifacts',v_artifacts,'errors',case when p_pass then '[]'::jsonb else '["failed"]'::jsonb end,
      'generatedAt',clock_timestamp()),clock_timestamp());
  perform pg_sleep(0.002);
end $$;

-- Two-language completeness matrix.
select pg_temp.make_order('61000000-0000-0000-0000-000000000001','["fr","de"]');
select pg_temp.make_package('61000000-0000-0000-0000-000000000001','fr','62000000-0000-0000-0000-000000000001',true);
insert into gate_results values('FR PASS, DE missing','gate_failed',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001')='gate_failed');
select pg_temp.make_package('61000000-0000-0000-0000-000000000001','de','62000000-0000-0000-0000-000000000002',false);
insert into gate_results values('FR PASS, DE FAIL','gate_failed',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001')='gate_failed');

-- A new immutable passing build supersedes the prior failed build.
select pg_temp.make_package('61000000-0000-0000-0000-000000000001','de','62000000-0000-0000-0000-000000000003',true);
insert into gate_results values('FR PASS, DE PASS','ready_for_review',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001')='ready_for_review');

-- Three-language missing case.
select pg_temp.make_order('61000000-0000-0000-0000-000000000002','["fr","de","es"]');
select pg_temp.make_package('61000000-0000-0000-0000-000000000002','fr','62000000-0000-0000-0000-000000000011',true);
select pg_temp.make_package('61000000-0000-0000-0000-000000000002','de','62000000-0000-0000-0000-000000000012',true);
insert into gate_results values('three languages, ES missing','gate_failed',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000002'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000002')='gate_failed');

-- A stale PASS can never override a newer current FAIL.
select pg_temp.make_order('61000000-0000-0000-0000-000000000003','["fr"]');
select pg_temp.make_package('61000000-0000-0000-0000-000000000003','fr','62000000-0000-0000-0000-000000000021',true);
select pg_temp.make_package('61000000-0000-0000-0000-000000000003','fr','62000000-0000-0000-0000-000000000022',false);
insert into gate_results values('stale PASS, current FAIL','gate_failed',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000003'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000003')='gate_failed');

-- A stale FAIL can never invalidate a newer current PASS.
select pg_temp.make_order('61000000-0000-0000-0000-000000000004','["fr"]');
select pg_temp.make_package('61000000-0000-0000-0000-000000000004','fr','62000000-0000-0000-0000-000000000031',false);
select pg_temp.make_package('61000000-0000-0000-0000-000000000004','fr','62000000-0000-0000-0000-000000000032',true);
insert into gate_results values('stale FAIL, current PASS','ready_for_review',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000004'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000004')='ready_for_review');

-- Wrong-language and fabricated latest PASS must fail authority.
select * from begin_order_language_build('61000000-0000-0000-0000-000000000001','fr','62000000-0000-0000-0000-000000000099');
insert into package_manifests(order_id,language,build_id,schema_version,status,manifest,created_at)
values('61000000-0000-0000-0000-000000000001','fr','62000000-0000-0000-0000-000000000099',
 '1.0','pass',jsonb_build_object('orderId','61000000-0000-0000-0000-000000000001','language','de',
 'buildId','62000000-0000-0000-0000-000000000099','status','pass','artifacts','[]'::jsonb,'errors','[]'::jsonb),
 clock_timestamp() + interval '1 second');
insert into gate_results values('latest fabricated wrong-language PASS','gate_failed',
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001'),
  resolve_order_package_gate('61000000-0000-0000-0000-000000000001')='gate_failed');

table gate_results;
rollback;

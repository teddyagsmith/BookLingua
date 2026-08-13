\set ON_ERROR_STOP on
begin;
create temporary table linkage_results(test text, actual text, passed boolean);

-- Valid source linkage and idempotent retry.
insert into orders(id,email,author_name,book_title,word_count,tier,file_format,languages,amount_paid,status)
values('71000000-0000-0000-0000-000000000001','link@example.invalid','Synthetic','Link',1000,'small','.txt','["fr"]',99,'processing');
insert into temp_uploads(session_id,file_name,file_format,content,word_count,source_storage_path,
 source_storage_bucket,source_sha256,source_size_bytes,source_manifest,glossary_saved_at)
values('72000000-0000-0000-0000-000000000001','book.txt','.txt','source',1,
 '72000000-0000-0000-0000-000000000001/book.txt','booklingua-private-sources',repeat('a',64),6,
 jsonb_build_object('sourceHash',repeat('a',64)),'2026-08-13T08:00:00Z');
select link_hardened_source_to_order('71000000-0000-0000-0000-000000000001',
 '72000000-0000-0000-0000-000000000001',jsonb_build_array(jsonb_build_object(
 'language','fr','schema_version','1.0','revision',1,'source_manifest_fingerprint',repeat('a',64),
 'content_fingerprint',repeat('b',64),'approved_at','2026-08-13T08:00:00Z','approval_source','author_scan',
 'brief',jsonb_build_object('schemaVersion','1.0','language','fr','sourceManifestFingerprint',repeat('a',64),
 'approvedAt','2026-08-13T08:00:00Z','revision',1,'approvalSource','author_scan','items','[]'::jsonb))));
insert into linkage_results select 'atomic linkage',
  format('files=%s briefs=%s temp=%s',
    (select count(*) from files where order_id='71000000-0000-0000-0000-000000000001'),
    (select count(*) from translation_briefs where order_id='71000000-0000-0000-0000-000000000001'),
    (select count(*) from temp_uploads where session_id='72000000-0000-0000-0000-000000000001')),
  (select source_linked_at is not null from orders where id='71000000-0000-0000-0000-000000000001')
  and (select count(*)=2 from files where order_id='71000000-0000-0000-0000-000000000001')
  and (select count(*)=1 from translation_briefs where order_id='71000000-0000-0000-0000-000000000001')
  and not exists(select 1 from temp_uploads where session_id='72000000-0000-0000-0000-000000000001');

select link_hardened_source_to_order('71000000-0000-0000-0000-000000000001',
 '72000000-0000-0000-0000-000000000001','[]');
insert into linkage_results values('same-source retry after cleanup','returned success',true);

do $$ begin
  begin
    perform link_hardened_source_to_order('71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000099','[]');
    raise exception 'expected_conflict';
  exception when raise_exception then
    if sqlerrm <> 'order_already_linked_to_other_source' then raise; end if;
  end;
end $$;
insert into linkage_results values('conflicting retry rejected','order_already_linked_to_other_source',true);

-- A bad second-language brief must roll back every write and retain temp source.
insert into orders(id,email,author_name,book_title,word_count,tier,file_format,languages,amount_paid,status)
values('71000000-0000-0000-0000-000000000002','rollback@example.invalid','Synthetic','Rollback',1000,'small','.txt','["fr","de"]',99,'processing');
insert into temp_uploads(session_id,file_name,file_format,content,word_count,source_storage_path,
 source_storage_bucket,source_sha256,source_size_bytes,source_manifest,glossary_saved_at)
values('72000000-0000-0000-0000-000000000002','book.txt','.txt','source',1,
 '72000000-0000-0000-0000-000000000002/book.txt','booklingua-private-sources',repeat('c',64),6,
 jsonb_build_object('sourceHash',repeat('c',64)),'2026-08-13T08:00:00Z');
do $$ begin
  begin
    perform link_hardened_source_to_order('71000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000002',jsonb_build_array(
      jsonb_build_object('language','fr'),jsonb_build_object('language','de')));
    raise exception 'expected_binding_failure';
  exception when raise_exception then
    if sqlerrm <> 'translation_brief_binding_invalid' then raise; end if;
  end;
end $$;
insert into linkage_results select 'mid-link failure rolls back',
 format('files=%s briefs=%s temp=%s',
   (select count(*) from files where order_id='71000000-0000-0000-0000-000000000002'),
   (select count(*) from translation_briefs where order_id='71000000-0000-0000-0000-000000000002'),
   (select count(*) from temp_uploads where session_id='72000000-0000-0000-0000-000000000002')),
 not exists(select 1 from files where order_id='71000000-0000-0000-0000-000000000002')
 and not exists(select 1 from translation_briefs where order_id='71000000-0000-0000-0000-000000000002')
 and exists(select 1 from temp_uploads where session_id='72000000-0000-0000-0000-000000000002')
 and (select source_linked_at is null from orders where id='71000000-0000-0000-0000-000000000002');

table linkage_results;
rollback;

\set ON_ERROR_STOP on
begin;

create temporary table probe_results(test text, actual text, passed boolean);

-- Synthetic legacy order: additive schema must permit the old shape.
insert into orders(id, email, author_name, book_title, word_count, tier, file_format,
  languages, amount_paid, status)
values ('10000000-0000-0000-0000-000000000001', 'legacy@example.invalid',
  'Legacy Author', 'Legacy Book', 1000, 'small', '.txt', '["fr"]', 99, 'pending_review');
insert into files(order_id, type, language, content)
values ('10000000-0000-0000-0000-000000000001', 'translated', 'fr', 'Texte traduit');
insert into translation_chunks(order_id, lang_code, chunk_index, pass, content)
values ('10000000-0000-0000-0000-000000000001', 'fr', 0, 'sonnet', 'cache legacy');
insert into probe_results values ('legacy schema insert', 'accepted', true);

-- Cache identities must coexist but exact duplicates must fail.
insert into translation_chunks(order_id, lang_code, chunk_index, pass, content,
  pipeline_version, schema_version, structure_fingerprint)
values
('10000000-0000-0000-0000-000000000001', 'fr', 0, 'sonnet', 'cache v2', 'semantic-v2', '2.0', 'fp-a'),
('10000000-0000-0000-0000-000000000001', 'fr', 0, 'sonnet', 'cache v1 other brief', 'legacy-v1', '1.0', 'fp-b');
insert into probe_results values ('cache v1/v2 coexistence',
  (select count(*)::text from translation_chunks where order_id='10000000-0000-0000-0000-000000000001'), true);

do $$ begin
  begin
    insert into translation_chunks(order_id, lang_code, chunk_index, pass, content,
      pipeline_version, schema_version, structure_fingerprint)
    values ('10000000-0000-0000-0000-000000000001','fr',0,'sonnet','duplicate','legacy-v1','1.0','legacy');
    raise exception 'probe_expected_unique_failure';
  exception when unique_violation then null; end;
end $$;
insert into probe_results values ('cache exact duplicate rejected', 'unique_violation', true);

-- Brief history is append-only and identities are constrained.
insert into translation_briefs(id, order_id, language, schema_version, revision,
 source_manifest_fingerprint, content_fingerprint, approved_at, approval_source, brief)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 'fr','1.0',1,repeat('a',64),repeat('b',64),now(),'admin','{}');
do $$ begin
  begin
    update translation_briefs set brief='{"changed":true}' where id='20000000-0000-0000-0000-000000000001';
    raise exception 'probe_expected_immutable_failure';
  exception when raise_exception then
    if sqlerrm <> 'translation_briefs_are_immutable' then raise; end if;
  end;
end $$;
insert into probe_results values ('brief mutation rejected', 'translation_briefs_are_immutable', true);

-- Real validation/artifact foreign-key binding.
insert into validation_reports(id,order_id,language,build_id,stage,validator_version,passed)
values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 'fr','40000000-0000-0000-0000-000000000001','final','1.0',true);
do $$ begin
  begin
    insert into artifacts(order_id,language,build_id,artifact_type,storage_bucket,storage_path,
      filename,sha256,size_bytes,validation_report_id,validation_status)
    values ('10000000-0000-0000-0000-000000000001','de','40000000-0000-0000-0000-000000000001',
      'final_docx','booklingua-private-artifacts','x','x.docx',repeat('c',64),10,
      '30000000-0000-0000-0000-000000000001','pass');
    raise exception 'probe_expected_fk_failure';
  exception when foreign_key_violation then null; end;
end $$;
insert into probe_results values ('artifact cross-language report rejected', 'foreign_key_violation', true);

do $$ begin
  begin
    insert into artifacts(order_id,language,build_id,artifact_type,storage_bucket,storage_path,
      filename,sha256,size_bytes,validation_report_id,validation_status)
    values ('10000000-0000-0000-0000-000000000001','fr','40000000-0000-0000-0000-000000000001',
      'final_docx','booklingua-private-artifacts','x','x.docx',repeat('c',64),0,
      '30000000-0000-0000-0000-000000000001','pass');
    raise exception 'probe_expected_check_failure';
  exception when check_violation then null; end;
end $$;
insert into probe_results values ('zero-byte artifact rejected', 'check_violation', true);

-- A fabricated caller-supplied PASS is persisted as immutable history but must
-- never be authoritative or make the order reviewable.
insert into package_manifests(id,order_id,language,build_id,schema_version,status,manifest)
values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 'fr','40000000-0000-0000-0000-000000000009','1.0','pass','{}');
insert into probe_results values ('fabricated PASS retained as non-authoritative history',
  is_authoritative_package_manifest('50000000-0000-0000-0000-000000000001')::text,
  not is_authoritative_package_manifest('50000000-0000-0000-0000-000000000001'));
insert into probe_results values ('fabricated PASS resolves ready',
  resolve_order_package_gate('10000000-0000-0000-0000-000000000001'),
  resolve_order_package_gate('10000000-0000-0000-0000-000000000001') = 'gate_failed');

table probe_results;
rollback;

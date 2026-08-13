-- READ-ONLY postconditions for the controlled incremental migration.
do $$
declare digest_schema text;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='qa_errors' and data_type='text' and is_nullable='YES') then
    raise exception 'orders.qa_errors postcondition failed';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conrelid='public.translation_chunks'::regclass and conname='translation_chunks_pass_check'))
     not like all(array['%sonnet%','%opus%','%semantic-pass1%','%semantic-pass2%']) then
    raise exception 'translation_chunks pass constraint postcondition failed';
  end if;
  if exists (select 1 from storage.buckets where id in ('booklingua-private-sources','booklingua-private-artifacts') and public is distinct from false) then
    raise exception 'Hardened bucket privacy postcondition failed';
  end if;
  select n.nspname into digest_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if digest_schema is null then raise exception 'pgcrypto extension missing'; end if;
  if to_regprocedure(format('%I.digest(bytea,text)',digest_schema)) is null
     and to_regprocedure(format('%I.digest(text,text)',digest_schema)) is null then
    raise exception 'pgcrypto digest unavailable in extension namespace %', digest_schema;
  end if;
end $$;

-- READ-ONLY preconditions for the observed hosted BookLingua catalog.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if not exists (
      select 1 from supabase_migrations.schema_migrations
      having count(*) = 1 and min(version) = '00000000000000'
    ) then
      raise exception 'Hosted baseline changed: migration ledger now exists';
    end if;
  end if;
  if to_regclass('public.orders') is null or to_regclass('public.translation_chunks') is null then
    raise exception 'Hosted baseline changed: required legacy tables missing';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='qa_errors') then
    raise exception 'Hosted baseline changed: orders.qa_errors already exists';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conrelid='public.translation_chunks'::regclass and conname='translation_chunks_pass_check'))
     not like '%sonnet%opus%' then
    raise exception 'Hosted baseline changed: translation_chunks pass constraint differs';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('order_language_builds','artifacts','package_manifests','translation_briefs','semantic_documents')) then
    raise exception 'Hosted baseline changed: hardening objects already exist';
  end if;
  if not exists (select 1 from storage.buckets where id='uploads' and public=false) then
    raise exception 'Hosted baseline changed: private uploads bucket missing';
  end if;
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname='pgcrypto'
      and (to_regprocedure(format('%I.digest(bytea,text)',n.nspname)) is not null
        or to_regprocedure(format('%I.digest(text,text)',n.nspname)) is not null)
  ) then
    raise exception 'Hosted baseline changed: pgcrypto digest is unavailable';
  end if;
end $$;

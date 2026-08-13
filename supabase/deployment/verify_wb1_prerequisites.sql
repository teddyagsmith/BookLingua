-- Read-only hosted prerequisite probe. Run and archive its result before WB1 deployment.
-- It deliberately performs no schema or migration-ledger mutation.
do $$
declare missing text[] := array[]::text[];
begin
  if to_regclass('public.orders') is null then missing := array_append(missing, 'orders'); end if;
  if to_regclass('public.files') is null then missing := array_append(missing, 'files'); end if;
  if to_regclass('public.temp_uploads') is null then missing := array_append(missing, 'temp_uploads'); end if;
  if to_regclass('public.translation_chunks') is null then missing := array_append(missing, 'translation_chunks'); end if;
  if to_regclass('public.email_subscribers') is null then missing := array_append(missing, 'email_subscribers'); end if;
  if array_length(missing, 1) is not null then
    raise exception 'WB1 prerequisite objects missing: %', array_to_string(missing, ', ');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='languages' and data_type='jsonb') then
    raise exception 'WB1 requires public.orders.languages JSONB';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='qa_errors') then
    raise exception 'Legacy approval requires public.orders.qa_errors';
  end if;
end $$;

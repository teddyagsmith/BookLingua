-- temp_uploads.session_id is text; orders.source_upload_id is uuid.
-- Comparing them directly raised "operator does not exist: text = uuid" inside
-- link_hardened_source_to_order, so every order failed to link its source after
-- 202611200001 was applied. Applied to production on 21 Nov 2026.
create or replace function public.persist_author_glossary_on_order_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_linked_at is not null and new.source_upload_id is not null then
    insert into files (order_id, type, language, content, original_content)
    select new.id, 'author_glossary', 'en', t.author_glossary_text,
      jsonb_build_object('filename', t.author_glossary_filename)::text
    from temp_uploads t
    where t.session_id = new.source_upload_id::text
      and t.author_glossary_text is not null
      and not exists (
        select 1 from files f
        where f.order_id = new.id and f.type = 'author_glossary'
      );
  end if;
  return new;
end;
$$;

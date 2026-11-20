-- Optional customer glossary, retained with the translation order.
alter table temp_uploads
  add column if not exists author_glossary_text text,
  add column if not exists author_glossary_filename text;

-- The two complimentary vouchers are globally single-use.
create unique index if not exists orders_single_use_gift_voucher_idx
  on orders(voucher_code)
  where voucher_code in ('GIFT3M8XK7QP', 'GIFT9V2RL6WN');

-- The existing source-link RPC deletes the temporary upload after linking it.
-- Persist the supplied glossary as an order file just before that deletion.
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
    where t.session_id = new.source_upload_id
      and t.author_glossary_text is not null
      and not exists (
        select 1 from files f
        where f.order_id = new.id and f.type = 'author_glossary'
      );
  end if;
  return new;
end;
$$;

drop trigger if exists persist_author_glossary_on_order_link on orders;
create trigger persist_author_glossary_on_order_link
after update of source_linked_at, source_upload_id on orders
for each row execute function public.persist_author_glossary_on_order_link();

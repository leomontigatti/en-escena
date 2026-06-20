begin;

alter table public.en_escena_price
  add column if not exists name text;

commit;

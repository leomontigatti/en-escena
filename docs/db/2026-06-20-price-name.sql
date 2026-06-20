begin;

alter table public.en_escena_price
  add column if not exists name text;

update public.en_escena_price
set name = case group_type
  when 'solo' then 'Precio Solo'
  when 'duo' then 'Precio Duo'
  when 'trio' then 'Precio Trio'
  when 'grupal' then 'Precio Grupal'
  else 'Precio'
end
where name is null or btrim(name) = '';

alter table public.en_escena_price
  alter column name set not null;

commit;

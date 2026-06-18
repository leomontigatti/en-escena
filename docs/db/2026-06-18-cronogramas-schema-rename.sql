-- Rename the physical DB model from schedule blocks/entries to
-- cronogramas/cupos de cronograma.
--
-- This migration intentionally aborts when an existing schedule entry has more
-- than one group type. The new model stores exactly one group_type per
-- schedule_capacity row, so those rows need a domain decision before migrating.

begin;

do $$
begin
  if to_regclass('public.en_escena_schedule_capacity') is not null then
    raise notice 'cronogramas schema rename already applied';
    return;
  end if;

  if exists (
    select 1
    from public.en_escena_schedule_entry
    where cardinality(group_types) <> 1
  ) then
    raise exception
      'Cannot migrate schedule_entry.group_types to schedule_capacity.group_type while rows with cardinality <> 1 exist';
  end if;
end $$;

alter table public.en_escena_schedule_block
  rename to en_escena_schedule;

alter table public.en_escena_schedule_block_modality
  rename to en_escena_schedule_modality;

alter table public.en_escena_schedule_entry
  rename to en_escena_schedule_capacity;

alter table public.en_escena_schedule_modality
  rename column schedule_block_id to schedule_id;

alter table public.en_escena_price
  rename column schedule_block_id to schedule_id;

alter table public.en_escena_schedule_capacity
  rename column schedule_block_id to schedule_id;

alter table public.en_escena_choreography
  rename column schedule_entry_id to schedule_capacity_id;

alter table public.en_escena_schedule_capacity
  add column group_type en_escena_group_type;

update public.en_escena_schedule_capacity
set group_type = group_types[1];

alter table public.en_escena_schedule_capacity
  alter column group_type set not null;

drop index if exists public.schedule_entry_block_group_types_unique;

alter table public.en_escena_schedule_capacity
  drop column group_types,
  drop column group_type_key;

alter table public.en_escena_schedule
  rename constraint en_escena_schedule_block_pkey to en_escena_schedule_pkey;

alter table public.en_escena_schedule
  rename constraint en_escena_schedule_block_event_id_en_escena_event_id_fk
  to en_escena_schedule_event_id_en_escena_event_id_fk;

alter table public.en_escena_schedule_modality
  rename constraint schedule_block_modality_block_fk
  to schedule_modality_schedule_fk;

alter table public.en_escena_schedule_modality
  rename constraint schedule_block_modality_modality_fk
  to schedule_modality_modality_fk;

alter table public.en_escena_schedule_capacity
  rename constraint en_escena_schedule_entry_pkey
  to en_escena_schedule_capacity_pkey;

alter table public.en_escena_schedule_capacity
  rename constraint schedule_entry_block_fk
  to schedule_capacity_schedule_fk;

alter table public.en_escena_price
  rename constraint price_schedule_block_fk
  to price_schedule_fk;

alter table public.en_escena_choreography
  rename constraint choreography_schedule_entry_fk
  to choreography_schedule_capacity_fk;

alter index if exists public.schedule_block_event_id_idx
  rename to schedule_event_id_idx;

alter index if exists public.schedule_block_event_name_unique
  rename to schedule_event_name_unique;

alter index if exists public.schedule_block_modality_block_id_idx
  rename to schedule_modality_schedule_id_idx;

alter index if exists public.schedule_block_modality_modality_id_idx
  rename to schedule_modality_modality_id_idx;

alter index if exists public.schedule_block_modality_unique
  rename to schedule_modality_unique;

alter index if exists public.price_schedule_block_id_idx
  rename to price_schedule_id_idx;

alter index if exists public.schedule_entry_block_id_idx
  rename to schedule_capacity_schedule_id_idx;

alter index if exists public.choreography_schedule_entry_id_idx
  rename to choreography_schedule_capacity_id_idx;

create unique index schedule_capacity_schedule_group_type_unique
  on public.en_escena_schedule_capacity (schedule_id, group_type);

commit;

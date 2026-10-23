-- The one-time cleanup that ships with #1065, as one transaction for
-- production. Rows withdrawn before #1065 kept everything they held; this
-- releases what each holds above the deposit it retains, newest payment first,
-- exactly as `scripts/release-withdrawn-excess.ts --apply` did on a copy of
-- production refreshed on 2026-10-23: 219100 across 7 choreography
-- inscriptions, five allocations reduced and two deleted. No seminar
-- inscription needed it on the copy.
--
-- Every figure is checked before it is written: each inscription is still
-- withdrawn, holds what the copy held and keeps the deposit its stored price
-- makes; each allocation still has the amount the copy had, in the pool it
-- locks; and no other withdrawn inscription, of either kind, holds more than
-- its deposit. Anything else raises and the whole transaction rolls back, so a
-- production that moved since the copy is left untouched and the plan is
-- regenerated from a newer copy. It takes the inscription rows and then the
-- pool locks, the order the app's money writers take them in. Run after the
-- deploy has finished, once the previous release no longer serves, with the
-- superuser (a write):
--
--   ssh root@rylai 'docker exec -i c24udczenueosjssymgxuhgf psql -U postgres -d enescena -v ON_ERROR_STOP=1' < scripts/release-withdrawn-excess.sql
--
-- Delete it, with the TypeScript script and its module, once it has run.

begin;

create temporary table withdrawn_excess_inscription (
  inscription_id varchar primary key,
  held_amount integer not null,
  retained_amount integer not null,
  academy_id varchar not null,
  event_id varchar not null
) on commit drop;

insert into withdrawn_excess_inscription values
  ('2dcdc324-81e2-4d41-b64e-13b643d9c70d', 53000, 15900, 'fa870f88-2e94-4952-b8ea-750a91184bf9', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('476456d6-f67e-4ed2-984c-327760143d9f', 23000, 6900, '77a8f3eb-6cd1-4afd-9d0a-e293c9737e58', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('6067aa02-bfc7-45fa-bfe7-4e30da98e816', 53000, 15900, '47bda3b1-e0e3-4eaf-95bf-52ab26264846', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('721397f2-ab89-419f-8d68-77aeb19fb5fd', 25000, 7500, 'cd5d1d22-7e46-474a-bfae-cbfa5b93fdb4', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('ac7b1b9e-d48c-4df5-893e-c4cc6d081c78', 53000, 15900, '47bda3b1-e0e3-4eaf-95bf-52ab26264846', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('c2da300e-c048-4aef-9195-81063f750732', 53000, 15900, 'c4455107-7f25-4e34-bc8f-cd14638e8226', '599a77d3-9347-4bb1-8993-648fcaf6212c'),
  ('fc809b10-a77b-41fb-9b6e-9f7785965ba8', 53000, 15900, 'eb1b0a1a-7503-4eb4-81d5-df619f26437f', '599a77d3-9347-4bb1-8993-648fcaf6212c');

create temporary table withdrawn_excess_allocation (
  allocation_id varchar primary key,
  inscription_id varchar not null,
  old_amount integer not null,
  new_amount integer not null
) on commit drop;

insert into withdrawn_excess_allocation values
  ('6877acc0-8fc2-4b69-910b-9b562059f377', '2dcdc324-81e2-4d41-b64e-13b643d9c70d', 53000, 15900),
  ('2825604c-b5a9-4df5-8bb5-1e1212955deb', '476456d6-f67e-4ed2-984c-327760143d9f', 16100, 0),
  ('a015a6ea-6d3d-48f1-9dba-222c920b2124', '6067aa02-bfc7-45fa-bfe7-4e30da98e816', 53000, 15900),
  ('cd92bc50-bbd7-4c8b-a14e-62b197ce947c', '721397f2-ab89-419f-8d68-77aeb19fb5fd', 25000, 7500),
  ('212c6662-0129-46cb-afd7-8c0a7ac79357', 'ac7b1b9e-d48c-4df5-893e-c4cc6d081c78', 53000, 15900),
  ('492fc7ec-7b55-49e7-b222-d2fdbbbeabb0', 'c2da300e-c048-4aef-9195-81063f750732', 53000, 15900),
  ('d06f13b5-4c4f-439f-8183-819a2ac441b2', 'fc809b10-a77b-41fb-9b6e-9f7785965ba8', 37100, 0);

do $$
declare
  planned record;
  changed integer;
  pool_key text;
begin
  perform 1
  from en_escena_choreography_dancer dancer
  join withdrawn_excess_inscription plan on plan.inscription_id = dancer.id
  where dancer.withdrawn_at is not null
  order by dancer.id
  for update of dancer;
  get diagnostics changed = row_count;
  if changed <> 7 then
    raise exception 'expected 7 withdrawn inscriptions, found %', changed;
  end if;

  foreach pool_key in array array[
      'academy-pool:47bda3b1-e0e3-4eaf-95bf-52ab26264846:599a77d3-9347-4bb1-8993-648fcaf6212c',
      'academy-pool:77a8f3eb-6cd1-4afd-9d0a-e293c9737e58:599a77d3-9347-4bb1-8993-648fcaf6212c',
      'academy-pool:c4455107-7f25-4e34-bc8f-cd14638e8226:599a77d3-9347-4bb1-8993-648fcaf6212c',
      'academy-pool:cd5d1d22-7e46-474a-bfae-cbfa5b93fdb4:599a77d3-9347-4bb1-8993-648fcaf6212c',
      'academy-pool:eb1b0a1a-7503-4eb4-81d5-df619f26437f:599a77d3-9347-4bb1-8993-648fcaf6212c',
      'academy-pool:fa870f88-2e94-4952-b8ea-750a91184bf9:599a77d3-9347-4bb1-8993-648fcaf6212c'
    ]
  loop
    perform pg_advisory_xact_lock(hashtext(pool_key));
  end loop;

  -- The plan is the whole of it: a row withdrawn since the copy by the
  -- previous release, which released nothing, would hold more than its deposit
  -- and be missed. Rows the new release withdrew hold their deposit or less. A
  -- row with no stored price can still be past its deposit (a preset funds it
  -- at the effective price without storing one), and SQL cannot resolve that
  -- price, so such a row stops the run for a check by hand.
  for planned in
    select withdrawn.inscription_id, withdrawn.held_now, withdrawn.deposit
    from (
      select dancer.id as inscription_id,
        sum(allocation.amount) as held_now,
        round(price.amount::numeric * event.required_deposit_percentage / 100.0) as deposit
      from en_escena_choreography_dancer dancer
      join en_escena_payment_allocation allocation
        on allocation.choreography_inscription_id = dancer.id
      join en_escena_choreography choreography on choreography.id = dancer.choreography_id
      join en_escena_event event on event.id = choreography.event_id
      left join en_escena_price price on price.id = dancer.selected_price_id
      where dancer.withdrawn_at is not null
      group by dancer.id, price.amount, event.required_deposit_percentage
      union all
      select inscription.id,
        sum(allocation.amount),
        round(price.amount::numeric * seminar.required_deposit_percentage / 100.0)
      from en_escena_seminar_inscription inscription
      join en_escena_payment_allocation allocation
        on allocation.seminar_inscription_id = inscription.id
      join en_escena_seminar seminar on seminar.id = inscription.seminar_id
      left join en_escena_seminar_price price on price.id = inscription.selected_price_id
      where inscription.withdrawn_at is not null
      group by inscription.id, price.amount, seminar.required_deposit_percentage
    ) withdrawn
    where (withdrawn.deposit is null or withdrawn.held_now > withdrawn.deposit)
      and withdrawn.inscription_id not in (
        select inscription_id from withdrawn_excess_inscription
      )
  loop
    raise exception 'withdrawn inscription % holds % against a deposit of % and is not in the plan: check it and regenerate the plan',
      planned.inscription_id, planned.held_now, coalesce(planned.deposit::text, 'no stored price');
  end loop;

  -- Each planned deposit is still what the row's stored price and its event's
  -- percentage make it.
  for planned in
    select plan.inscription_id, plan.retained_amount,
      round(price.amount::numeric * event.required_deposit_percentage / 100.0) as deposit
    from withdrawn_excess_inscription plan
    join en_escena_choreography_dancer dancer on dancer.id = plan.inscription_id
    join en_escena_choreography choreography on choreography.id = dancer.choreography_id
    join en_escena_event event on event.id = choreography.event_id
    left join en_escena_price price on price.id = dancer.selected_price_id
  loop
    if planned.deposit is distinct from planned.retained_amount then
      raise exception 'inscription % has deposit %, the plan keeps %',
        planned.inscription_id, planned.deposit, planned.retained_amount;
    end if;
  end loop;

  for planned in
    select plan.inscription_id, plan.held_amount, coalesce(sum(allocation.amount), 0) as held_now
    from withdrawn_excess_inscription plan
    left join en_escena_payment_allocation allocation
      on allocation.choreography_inscription_id = plan.inscription_id
    group by plan.inscription_id, plan.held_amount
  loop
    if planned.held_now <> planned.held_amount then
      raise exception 'inscription % holds %, expected %',
        planned.inscription_id, planned.held_now, planned.held_amount;
    end if;
  end loop;

  for planned in select * from withdrawn_excess_allocation order by allocation_id loop
    if planned.new_amount = 0 then
      delete from en_escena_payment_allocation
      where id = planned.allocation_id
        and choreography_inscription_id = planned.inscription_id
        and amount = planned.old_amount
        and (academy_id, event_id) = (
          select academy_id, event_id from withdrawn_excess_inscription
          where inscription_id = planned.inscription_id
        );
    else
      update en_escena_payment_allocation
      set amount = planned.new_amount, updated_at = now()
      where id = planned.allocation_id
        and choreography_inscription_id = planned.inscription_id
        and amount = planned.old_amount
        and (academy_id, event_id) = (
          select academy_id, event_id from withdrawn_excess_inscription
          where inscription_id = planned.inscription_id
        );
    end if;
    get diagnostics changed = row_count;
    if changed <> 1 then
      raise exception 'allocation % no longer holds %',
        planned.allocation_id, planned.old_amount;
    end if;
  end loop;

  for planned in
    select plan.inscription_id, plan.retained_amount, coalesce(sum(allocation.amount), 0) as held_now
    from withdrawn_excess_inscription plan
    left join en_escena_payment_allocation allocation
      on allocation.choreography_inscription_id = plan.inscription_id
    group by plan.inscription_id, plan.retained_amount
  loop
    if planned.held_now <> planned.retained_amount then
      raise exception 'inscription % ends at %, expected its deposit %',
        planned.inscription_id, planned.held_now, planned.retained_amount;
    end if;
  end loop;

  raise notice 'released 219100 across 7 withdrawn inscriptions';
end
$$;

commit;

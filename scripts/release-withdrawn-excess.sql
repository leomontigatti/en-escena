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
-- locks; and no other withdrawn inscription, of either kind, holds money the
-- copy did not account for: a row withdrawn after the copy and before the
-- deploy finished, or a settled row holding more than it did. Anything else
-- raises and the whole transaction rolls back, so a production that moved since
-- the copy is left untouched and the plan is regenerated from a newer copy. It
-- takes the inscription rows and then the pool locks, the order the app's money
-- writers take them in. Run after the deploy has finished, once the previous
-- release no longer serves, with the superuser (a write):
--
--   ssh root@rylai "docker exec -i c24udczenueosjssymgxuhgf psql -U postgres -d enescena -v ON_ERROR_STOP=1 -v deployed_at='<when the deploy finished, ISO 8601 with offset>'" < scripts/release-withdrawn-excess.sql
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

-- The window the copy cannot see: from the copy's last withdrawal to the
-- moment the deploy finished, which the run passes in (`-v deployed_at=...`).
-- Without it psql leaves the variable unreplaced and the statement fails.
create temporary table withdrawn_excess_window on commit drop as
select
  timestamptz '2026-10-21 20:20:58.037+00' as copied_at,
  :'deployed_at'::timestamptz as deployed_at;

-- The other withdrawn rows holding money on the copy, already on their
-- deposit: what each held then.
create temporary table withdrawn_excess_settled (
  inscription_id varchar primary key,
  held_amount integer not null
) on commit drop;

insert into withdrawn_excess_settled values
  ('0d3f6736-d61b-40b6-b7c0-b6b86eed2f8f', 8400),
  ('104538f7-1d29-428e-8419-0d2f13475999', 9000),
  ('17ec8b74-8586-43ad-8e1e-ae8c255c1672', 9000),
  ('3c1e24d6-a219-4b81-8dd7-54de64756f5a', 15900),
  ('42d2a800-b40f-4284-91a1-f53b4ade25a5', 9000),
  ('50b639bd-b59b-427a-9e40-77712dbad934', 6900),
  ('57feb558-8283-4231-8e59-924c0d3eaf28', 13200),
  ('583770a4-da19-4888-9393-2a5ef514adbc', 9000),
  ('608db61c-bd18-4152-9b50-805763c7bd3e', 15900),
  ('8839a533-5fa9-49dc-b216-d610652d64ac', 12600),
  ('a0a3d918-b21c-41d5-ba80-78f0be4104ef', 8400),
  ('abb0751a-4d76-4d5e-87bb-c3c8f05de97c', 6900),
  ('b4cfd974-5936-4e1e-95c7-85c56bc59575', 15300),
  ('d2893c85-b7b2-4cad-9881-586aa25e793a', 7500),
  ('d808553a-f2ca-4ee6-a26e-be70c0e479b5', 6900),
  ('e12e500a-5027-45a3-ab8d-cb936fc8032a', 15900),
  ('e3efcea3-c8ef-4d41-afaa-59352ffd8d49', 8400),
  ('ecb2b552-08d5-46c2-9d3e-c8e4f478affa', 6900),
  ('f5ae7ec6-cea1-44cd-affd-114764ac5e0e', 8400),
  ('f5fcf5f7-0f3d-4c27-a3d1-b696663da0dc', 12600),
  ('f64f626e-1082-474d-b49b-480e87102233', 9000),
  ('fba57c70-13f3-4ee2-ad52-aedd0ded8b7b', 12600);

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

  -- The plan is the whole of it. Every withdrawn row on the copy is either
  -- planned or settled, and a settled row can only have lost money since (a
  -- release of all of it). A row the previous release withdrew after the copy
  -- released nothing and may hold an excess no one measured, so any such row
  -- holding money stops the run for a check by hand. Rows the new release
  -- withdraws, after the deploy finished, released their excess as they were
  -- withdrawn.
  for planned in
    select withdrawn.inscription_id, withdrawn.held_now, withdrawn.withdrawn_at
    from (
      select dancer.id as inscription_id, dancer.withdrawn_at,
        sum(allocation.amount) as held_now
      from en_escena_choreography_dancer dancer
      join en_escena_payment_allocation allocation
        on allocation.choreography_inscription_id = dancer.id
      where dancer.withdrawn_at is not null
      group by dancer.id, dancer.withdrawn_at
      union all
      select inscription.id, inscription.withdrawn_at, sum(allocation.amount)
      from en_escena_seminar_inscription inscription
      join en_escena_payment_allocation allocation
        on allocation.seminar_inscription_id = inscription.id
      where inscription.withdrawn_at is not null
      group by inscription.id, inscription.withdrawn_at
    ) withdrawn
    cross join withdrawn_excess_window window_bounds
    left join withdrawn_excess_settled settled
      on settled.inscription_id = withdrawn.inscription_id
    where withdrawn.inscription_id not in (
        select inscription_id from withdrawn_excess_inscription
      )
      and withdrawn.withdrawn_at < window_bounds.deployed_at
      and (
        withdrawn.withdrawn_at > window_bounds.copied_at
        or settled.held_amount is null
        or withdrawn.held_now > settled.held_amount
      )
  loop
    raise exception 'withdrawn inscription % (withdrawn %) holds % and is neither planned nor settled on the copy: check it and regenerate the plan',
      planned.inscription_id, planned.withdrawn_at, planned.held_now;
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

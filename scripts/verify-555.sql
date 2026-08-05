-- Verification queries for the #547 payment-allocation migration (#555).
--
-- Read-only. Every statement is a SELECT; nothing here writes, and it is safe
-- to run against production.
--
-- Purpose: the migration plan recorded on #555 rests on four counterexample
-- classes all being empty. They were empty on 2026-08-05, but production is
-- live — registration is open and rows keep arriving — so re-run this
-- immediately before the destructive migration and compare against the
-- baseline in the "Expected" comments below. A class that stopped being empty
-- invalidates a specific decision of map #547; each query says which.
--
-- Run against production:
--   ssh root@<host> "docker exec -i <container> psql -U postgres -d enescena \
--     -A -F' | '" < scripts/verify-555.sql
--
-- Run against a local copy:
--   docker exec -i en-escena-postgres psql -U postgres -d en-escena \
--     -A -F' | ' < scripts/verify-555.sql
--
-- Note: `pnpm db:refresh:prod` does not currently work — the Coolify Postgres
-- publishes no port. See #595. Run the queries remotely instead.

\echo '=== 0. Volume ==='
-- Context only, decides nothing. Baseline 2026-08-05 (production):
--   payment_allocation 402 | choreography_dancer 364 | payment 20
--   comprobante 0 | price 22 | event 1
select 'payment_allocation' as tabla, count(*)::text as filas from en_escena_payment_allocation
union all select 'choreography_dancer', count(*)::text from en_escena_choreography_dancer
union all select 'payment', count(*)::text from en_escena_payment
union all select 'comprobante', count(*)::text from en_escena_comprobante
union all select 'price', count(*)::text from en_escena_price
union all select 'event', count(*)::text from en_escena_event;

\echo ''
\echo '=== 1-5. Counterexample classes ==='
-- Baseline 2026-08-05 (production):
--   pares_a_fusionar 62 | alloc_amount_cero 0 | alloc_amount_negativo 0
--   frozen_distinto_precio 0 | frozen_sin_price_id 0
--   selected_price_null 24 | selected_price_no_null 340
--
-- What a non-zero result means, per class:
--
--   pares_a_fusionar        Expected work, not a counterexample. Pairs holding
--                           two rows (a `deposit` and a `balance` from the same
--                           payment to the same inscription) that #549's unique
--                           index on (payment_id, inscription_id) forces into
--                           one. Merge rule: amount = sum, the row with the
--                           older created_at survives. Nothing FKs to
--                           payment_allocation.id, so the surviving id is free.
--
--   alloc_amount_cero       Rows that would violate #549's `amount > 0` CHECK on
--   alloc_amount_negativo   arrival. Delete them, do not migrate them. Both were
--                           zero and no code path creates them, so the plan
--                           carries no DELETE branch — a non-zero result means
--                           adding one.
--
--   frozen_distinto_precio  DIRECT COUNTEREXAMPLE to decision 6 of map #547,
--   frozen_sin_price_id     which assumes every frozenBasePriceAmount equals its
--                           price row's current amount. Non-zero means the
--                           column cannot be dropped without resolving those
--                           rows first, and the decision goes back to the map.
--                           These two are the classes the migration asserts on.
--
--   selected_price_null     Rows the #621 NOT NULL must backfill. Sizing, not a
--                           problem. See query 7 for the backfill preview.
select 'pares_a_fusionar' as verificacion, count(*)::text as filas from (
  select payment_id, inscription_id
  from en_escena_payment_allocation
  group by 1, 2
  having count(*) > 1
) t
union all select 'alloc_amount_cero', count(*)::text
  from en_escena_payment_allocation where amount = 0
union all select 'alloc_amount_negativo', count(*)::text
  from en_escena_payment_allocation where amount < 0
union all select 'frozen_distinto_precio', count(*)::text
  from en_escena_choreography_dancer cd
  join en_escena_price p on p.id = cd.selected_price_id
  where cd.frozen_base_price_amount is not null
    and cd.frozen_base_price_amount <> p.amount
union all select 'frozen_sin_price_id', count(*)::text
  from en_escena_choreography_dancer
  where frozen_base_price_amount is not null and selected_price_id is null
union all select 'selected_price_null', count(*)::text
  from en_escena_choreography_dancer where selected_price_id is null
union all select 'selected_price_no_null', count(*)::text
  from en_escena_choreography_dancer where selected_price_id is not null;

\echo ''
\echo '=== 1b. Offending ids for the two asserted classes ==='
-- Empty at baseline. If query 1-5 shows either frozen_* class non-zero, these
-- are the rows to take back to map #547 before the migration is written.
select cd.id as inscription_id,
       cd.frozen_base_price_amount,
       p.amount as price_amount,
       cd.selected_price_id
from en_escena_choreography_dancer cd
left join en_escena_price p on p.id = cd.selected_price_id
where cd.frozen_base_price_amount is not null
  and (cd.selected_price_id is null or cd.frozen_base_price_amount <> p.amount)
order by cd.id;

\echo ''
\echo '=== 6. Date-derived state vs money-derived state ==='
-- The check #555 requires before dropping deposit_reference_date and
-- balance_reference_date: verify against real data that the two definitions
-- agree. `deriveInscriptionFinancialState` reads the dates today
-- (app/lib/finances/operational-summary-calculations.server.ts:94-108); after
-- the migration the state comes from money against a threshold.
--
-- Baseline 2026-08-05 (production): everything on the diagonal —
--   pagada/pagada 62 | senada/senada 278 | impaga/sin_total 24
--
-- ANY row off the diagonal is a pre-existing inconsistency that the migration
-- would silently resolve in one direction or the other, with nobody deciding
-- which. Enumerate them with query 6b and take them to #555.
--
-- Deliberately NOT part of the migration's abort assertion: it is the most
-- expensive to express in SQL, the most prone to a false positive from the
-- integer rounding in `pct / 100`, and its consequence is a recomputed state
-- rather than a lost amount.
with a as (
  select inscription_id, sum(amount) as paid
  from en_escena_payment_allocation group by 1
), i as (
  select cd.id,
    coalesce(a.paid, 0) as paid,
    cd.deposit_reference_date, cd.balance_reference_date,
    cd.deposit_amount, cd.final_total_amount, cd.frozen_base_price_amount,
    p.amount as price_amount,
    e.required_deposit_percentage as pct
  from en_escena_choreography_dancer cd
  join en_escena_choreography ch on ch.id = cd.choreography_id
  join en_escena_event e on e.id = ch.event_id
  left join en_escena_price p on p.id = cd.selected_price_id
  left join a on a.inscription_id = cd.id
), d as (
  select id, paid,
    case when balance_reference_date is not null then 'pagada'
         when deposit_reference_date is not null then 'senada'
         else 'impaga' end as estado_fechas,
    coalesce(final_total_amount, price_amount, frozen_base_price_amount) as total,
    coalesce(deposit_amount,
             (coalesce(price_amount, frozen_base_price_amount) * pct / 100)) as umbral
  from i
)
select estado_fechas,
  case when total is null then 'sin_total'
       when paid >= total then 'pagada'
       when umbral is not null and paid >= umbral then 'senada'
       else 'impaga' end as estado_plata,
  count(*)
from d
group by 1, 2
order by 1, 2;

\echo ''
\echo '=== 7. Backfill preview for the NOT NULL selected_price_id ==='
-- The rule settled on #555: the price row with the LATEST payment_deadline for
-- the inscription's (event, group_type, schedule), preserving
-- `resolveApplicablePrice`'s precedence — schedule-specific first, general as
-- fallback — but WITHOUT the "still live today" filter.
--
-- Why not the currently-applicable row: it would make the migration's result
-- depend on the calendar date of the deploy, differing across environments and
-- across every test-database reset. Map #547's standing preference is
-- determinism over convenience.
--
-- Why the latest deadline specifically: these rows are all un-crossed, so
-- #618's read derivation `crossed ? stored : (current ?? stored)` shows
-- `current`, never the stored row — the value is invisible until every price
-- row has expired and the `?? stored` fallback surfaces it. #621 justified that
-- fallback as freezing "the last row the price list actually offered", and the
-- latest deadline is exactly that row.
--
-- Baseline 2026-08-05 (production): 23 general | 1 especifico | 0 SIN FILA.
--
-- SIN FILA > 0 means an inscription whose (schedule, group_type) has no price
-- row at all — distinct from "all expired", which this rule tolerates by
-- design. It would need a decision before the migration runs.
with n as (
  select cd.id, ch.group_type, ch.schedule_id, ch.event_id
  from en_escena_choreography_dancer cd
  join en_escena_choreography ch on ch.id = cd.choreography_id
  where cd.selected_price_id is null
), cand as (
  select n.id,
    (select p.id from en_escena_price p
      where p.event_id = n.event_id
        and p.group_type = n.group_type
        and p.schedule_id = n.schedule_id
      order by p.payment_deadline desc nulls first, p.amount desc
      limit 1) as specific_id,
    (select p.id from en_escena_price p
      where p.event_id = n.event_id
        and p.group_type = n.group_type
        and p.schedule_id is null
      order by p.payment_deadline desc nulls first, p.amount desc
      limit 1) as general_id
  from n
)
select case when specific_id is not null then 'especifico'
            when general_id is not null then 'general'
            else 'SIN FILA' end as resultado,
       count(*)
from cand
group by 1
order by 1;

\echo ''
\echo '=== 7b. Backfill preview, row by row ==='
-- The exact value the migration would write, with the amount it implies, so the
-- result can be eyeballed before the NOT NULL lands.
with n as (
  select cd.id, ch.group_type, ch.schedule_id, ch.event_id
  from en_escena_choreography_dancer cd
  join en_escena_choreography ch on ch.id = cd.choreography_id
  where cd.selected_price_id is null
), cand as (
  select n.id, n.group_type,
    coalesce(
      (select p.id from en_escena_price p
        where p.event_id = n.event_id and p.group_type = n.group_type
          and p.schedule_id = n.schedule_id
        order by p.payment_deadline desc nulls first, p.amount desc limit 1),
      (select p.id from en_escena_price p
        where p.event_id = n.event_id and p.group_type = n.group_type
          and p.schedule_id is null
        order by p.payment_deadline desc nulls first, p.amount desc limit 1)
    ) as price_id
  from n
)
select cand.id as inscription_id, cand.group_type,
       cand.price_id, p.payment_deadline, p.amount,
       p.schedule_id is null as es_general
from cand
left join en_escena_price p on p.id = cand.price_id
order by cand.group_type, p.amount;

\echo ''
\echo '=== 8. Price-list expiry ==='
-- Baseline 2026-08-05 (production): 22 rows, NONE with a null payment_deadline,
-- the furthest at 2026-10-10.
--
-- That last fact is why the backfill rule ignores "live today": from the day
-- after the furthest deadline, no price row is applicable to anything, every
-- read falls through to #618's `?? stored` fallback, and a
-- currently-applicable-row backfill would have frozen an arbitrary
-- intermediate tier. Related open defect: #622 — registration readiness ignores
-- payment_deadline entirely.
select group_type,
       schedule_id is null as es_general,
       payment_deadline,
       amount
from en_escena_price
order by group_type, payment_deadline nulls last, amount;

\echo ''
\echo '=== 9. Merge preview for the duplicate allocation pairs ==='
-- What the merge step will collapse. Baseline 2026-08-05: 62 pairs, each one a
-- `deposit` + a `balance`, matching the `pagada` count exactly — a pair is
-- precisely a fully-paid inscription. Decision 5 of map #547 drops
-- allocation_type, so the two rows carry no distinguishing meaning: money is
-- fungible and the merge loses nothing.
select payment_id,
       inscription_id,
       count(*) as filas,
       sum(amount) as monto_fusionado,
       min(created_at) as created_at_sobreviviente
from en_escena_payment_allocation
group by 1, 2
having count(*) > 1
order by 3 desc, 4 desc;

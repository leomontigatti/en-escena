-- The price lock moves from the first allocated peso to the deposit threshold
-- crossing. Only the guard function changes: no table, column, index or
-- constraint is touched, which is why this migration is hand-written and its
-- snapshot is identical to the previous one.
--
-- Until now the guard refused to move `selected_price_id` on any inscription
-- holding a single allocation row. That let an academy freeze the whole price
-- list for one peso per inscription ahead of a price rollover — exactly what the
-- seña is supposed to buy. From here the row's price is fixed once its
-- allocations reach the deposit derived from the price it **stores**, and below
-- that threshold it may be moved freely.
--
-- Testing against the stored price is what stops the rule being circular: the
-- threshold is derived from the price, so 1000 allocated is crossed against a
-- stored price of 3000 (deposit 900) and would be un-crossed against a new one
-- of 10000 (deposit 3000). `OLD."selected_price_id"` is the only side of the
-- comparison that does not depend on the answer.
--
-- The deposit uses `ROUND` over the same product as `calculateDepositAmount`.
-- Both amounts are non-negative, so Postgres rounding half away from zero and
-- JavaScript's `Math.round` rounding half toward `+∞` agree on every input this
-- can see.
--
-- Money is required on top of the comparison, and the branch is live rather
-- than defensive. A deposit of zero is not reached through a zero percentage —
-- `MIN_REQUIRED_DEPOSIT_PERCENTAGE` is 1 and a price amount must be a positive
-- integer — but through one that **rounds** to zero: `ROUND(1 * 1 / 100)` is 0,
-- and so is `ROUND(4 * 10 / 100)`. Without `allocated_amount = 0` such a row
-- would lock its price while holding nothing, and since the only way out of a
-- locked price is taking money off, that lock could never be opened again.
--
-- The application evaluates the same rule before this runs, and the two agree
-- because of **the order the writers write in**: `allocateToInscription` and
-- `payChoreographiesPreset` both write the price *before* moving money, inside
-- one transaction. So the `SUM(pa.amount)` read here is exactly the
-- `allocatedAmount` the application evaluated. Inverting that order in either
-- writer would make the two disagree on the exact boundary of the threshold —
-- the application would judge on the money after the write and this trigger on
-- the money before it.
--
-- There is no down migration, here or anywhere in this repo, so the rollback
-- order is worth stating: **application first, function second.** The old
-- application is stricter than this function and refuses before reaching the
-- database, so reverting only the application is safe. Reverting only the
-- function is not: the new application accepts below-threshold price changes
-- that the old function rejects, and the administrator gets a raw
-- `check_violation`.
--
-- The text is for whoever reads a log, not for an academy: the dialog refuses
-- first, in Spanish.
CREATE OR REPLACE FUNCTION "en_escena_guard_inscription_selected_price"() RETURNS trigger AS $$
DECLARE
  allocated_amount integer;
  stored_deposit_amount integer;
BEGIN
  IF NEW."selected_price_id" IS NOT DISTINCT FROM OLD."selected_price_id"
     OR OLD."selected_price_id" IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(pa."amount"), 0) INTO allocated_amount
  FROM "en_escena_payment_allocation" AS pa
  WHERE pa."inscription_id" = OLD."id";

  IF allocated_amount = 0 THEN
    RETURN NEW;
  END IF;

  SELECT ROUND(p."amount"::numeric * e."required_deposit_percentage" / 100)
    INTO stored_deposit_amount
  FROM "en_escena_price" AS p
  JOIN "en_escena_event" AS e ON e."id" = p."event_id"
  WHERE p."id" = OLD."selected_price_id";

  IF stored_deposit_amount IS NOT NULL
     AND allocated_amount >= stored_deposit_amount
  THEN
    RAISE EXCEPTION 'Cannot change the selected price of an inscription that has covered its deposit threshold.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

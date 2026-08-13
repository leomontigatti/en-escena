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
-- Money is required on top of the comparison. A zero deposit — an event with
-- `required_deposit_percentage` at 0 — would otherwise lock the price of a row
-- holding nothing, and the way out of a locked price is taking money off, so
-- that lock could never be opened.
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

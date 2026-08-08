-- Drop of the ten inscription snapshot columns (#555, step 5; issue #689).
-- Irreversible on purpose: there is no `down`, and the only net is the manual
-- Coolify backup taken immediately before the deploy.
--
-- The guard below aborts the whole migration on the two counterexample classes
-- that `scripts/verify-555.sql` — deleted with this migration, shipped in #632 —
-- named `frozen_sin_price_id` and `frozen_distinto_precio`, and singled out as
-- "the classes the migration asserts on". Both are about
-- `frozen_base_price_amount`, and both mean the same thing: the derived model
-- could not reproduce this row's frozen amount, so dropping the column would
-- lose information.
--
--   * a frozen amount with no `selected_price_id` — nothing to derive it from;
--   * a frozen amount that disagrees with its price row's current amount —
--     decision 6 of map #547 assumed they always agree.
--
-- Note what the guard deliberately does NOT catch: the mere presence of legacy
-- snapshot values. Every row created before #676 carries a real
-- `deposit_reference_date`, a `deposit_amount` and the rest, and those are
-- exactly the values this migration exists to drop — a guard that fired on them
-- would fire on every production row and could never pass. What the guard
-- protects is the one column whose value the new model has to be able to
-- reconstruct.
--
-- The date-vs-money comparison (query 6 of that script) is deliberately not
-- asserted here, for the reasons recorded alongside it: it is
-- the most expensive to express in SQL, the most prone to a false positive from
-- integer rounding, and its consequence is a recomputed state rather than a lost
-- amount. It stays a pre-flight human check.
DO $$
DECLARE
  offending_rows bigint;
BEGIN
  SELECT count(*) INTO offending_rows
  FROM "en_escena_choreography_dancer" AS cd
  LEFT JOIN "en_escena_price" AS p ON p."id" = cd."selected_price_id"
  WHERE cd."frozen_base_price_amount" IS NOT NULL
    AND (cd."selected_price_id" IS NULL OR cd."frozen_base_price_amount" <> p."amount");

  IF offending_rows > 0 THEN
    RAISE EXCEPTION
      'Cannot drop the inscription snapshot columns: % inscription(s) hold a frozen base price the derived model cannot reproduce (no selected price, or a frozen amount that disagrees with its price row). Resolve those rows and take the result back to map #547 before deploying this migration.',
      offending_rows
      USING ERRCODE = 'check_violation';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "frozen_base_price_amount";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "deposit_reference_date";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "deposit_percentage";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "deposit_amount";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "balance_reference_date";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "applied_dancer_discount_percentage";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "applied_dancer_discount_amount";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "final_total_amount";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "balance_amount";--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" DROP COLUMN "balance_completed_at";

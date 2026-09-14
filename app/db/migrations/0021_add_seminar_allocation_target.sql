-- The allocation and the comprobante line stop assuming a choreography.
--
-- Hand-written because every column and constraint here is a RENAME, and
-- drizzle-kit can only offer the rename interactively; generated, it would drop
-- `inscription_id` and create the new column beside it, taking every existing
-- allocation and every billed line with it. The snapshot is the generated one:
-- it describes the schema, not the path taken to it, and the path is what the
-- statements below choose.
--
-- No data moves. Every row keeps its id, its amount and its target; what
-- changes is the name the target is read under and the fact that a second name
-- now exists beside it.
ALTER TABLE "en_escena_payment_allocation" RENAME COLUMN "inscription_id" TO "choreography_inscription_id";--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" RENAME CONSTRAINT "payment_allocation_inscription_fk" TO "payment_allocation_choreography_inscription_fk";--> statement-breakpoint
ALTER INDEX "payment_allocation_inscription_idx" RENAME TO "payment_allocation_choreography_inscription_idx";--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ALTER COLUMN "choreography_inscription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD COLUMN "seminar_inscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_seminar_inscription_fk" FOREIGN KEY ("seminar_inscription_id") REFERENCES "public"."en_escena_seminar_inscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocation_seminar_inscription_idx" ON "en_escena_payment_allocation" USING btree ("seminar_inscription_id","created_at");--> statement-breakpoint
-- `num_nonnulls(...) = 1` is what keeps "nullable" from meaning "optional": the
-- pair of columns is one target, and a row naming none or both is not an
-- allocation of anything.
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_exactly_one_target" CHECK (num_nonnulls("en_escena_payment_allocation"."choreography_inscription_id", "en_escena_payment_allocation"."seminar_inscription_id") = 1);--> statement-breakpoint
-- The unique index becomes a unique CONSTRAINT spanning both target columns
-- with `NULLS NOT DISTINCT`. Without the clause, Postgres would read the null
-- half of every target as distinct and the summing upsert would insert a second
-- row per allocation instead of adding to the first. A constraint rather than an
-- index because `ON CONFLICT` needs a single inferable target and Drizzle can
-- only express the clause on a constraint.
DROP INDEX "payment_allocation_payment_inscription_unique";--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_payment_target_unique" UNIQUE NULLS NOT DISTINCT("payment_id","choreography_inscription_id","seminar_inscription_id");--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" RENAME COLUMN "inscription_id" TO "choreography_inscription_id";--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" RENAME CONSTRAINT "comprobante_inscription_inscription_fk" TO "comprobante_inscription_choreography_fk";--> statement-breakpoint
ALTER INDEX "comprobante_inscription_inscription_idx" RENAME TO "comprobante_inscription_choreography_idx";--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD COLUMN "seminar_inscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_seminar_fk" FOREIGN KEY ("seminar_inscription_id") REFERENCES "public"."en_escena_seminar_inscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comprobante_inscription_seminar_idx" ON "en_escena_comprobante_inscription" USING btree ("seminar_inscription_id");--> statement-breakpoint
-- At most one, not exactly one: a line whose inscription was deleted after
-- emission keeps its frozen amount with both columns null, and that is the only
-- state of a line that names nobody.
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_at_most_one_target" CHECK (num_nonnulls("en_escena_comprobante_inscription"."choreography_inscription_id", "en_escena_comprobante_inscription"."seminar_inscription_id") <= 1);--> statement-breakpoint
-- Two partial unique indexes, one per kind, replacing the single unique over
-- `(comprobante, inscription)`. A plain unique over both target columns would
-- have to treat nulls as equal to say anything about a seminar line, and then
-- two orphaned lines of one comprobante — both targets null on each — would
-- collide. Partial per kind says exactly what is meant: one line per billed
-- inscription, nothing at all about the orphans.
DROP INDEX "comprobante_inscription_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_inscription_choreography_unique" ON "en_escena_comprobante_inscription" USING btree ("comprobante_id","choreography_inscription_id") WHERE "en_escena_comprobante_inscription"."choreography_inscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_inscription_seminar_unique" ON "en_escena_comprobante_inscription" USING btree ("comprobante_id","seminar_inscription_id") WHERE "en_escena_comprobante_inscription"."seminar_inscription_id" is not null;--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
-- The choreography guard is re-issued with no change other than the renamed
-- column. Its behaviour is untouched: plpgsql bodies are parsed at call time,
-- so after the rename above the stored 0011 body would fail on
-- `pa."inscription_id"` the first time an administrator moved a price. This is
-- the same function as 0011 — comments, thresholds and all — reading
-- `choreography_inscription_id`.
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
  WHERE pa."choreography_inscription_id" = OLD."id";

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
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- The seminar twin of `en_escena_guard_inscription_selected_price` (migration
-- 0011), and deliberately a SECOND function rather than one branching on
-- `TG_TABLE_NAME`: the two read different tables for the money and different
-- rows for the rate, and a shared body would have to name both in every branch.
--
-- The rule is the same one, re-keyed. The price a seminar inscription stores is
-- free to move while the row has not covered the deposit derived from that
-- stored price, and fixed once it has — because both thresholds are derived from
-- it, and covering the deposit is also what takes the place. The comparison is
-- against `OLD."selected_price_id"` for the same reason as on the choreography
-- side: testing against the incoming price would make the threshold depend on
-- the answer.
--
-- What differs from 0011 is where the percentage comes from. A seminar carries
-- its OWN `required_deposit_percentage`, never the event's, so the join goes
-- through `en_escena_seminar` and not `en_escena_event`.
--
-- `allocated_amount = 0` opens the lock, and the branch is live rather than
-- defensive: a deposit that ROUNDS to zero would otherwise lock the price of a
-- row holding nothing, and the only way out of a locked price is taking money
-- off.
--
-- The writer order rule holds here too: the price is written BEFORE the money,
-- inside one transaction, so the `SUM(pa."amount")` this reads is the same
-- figure the application judged on.
--
-- The text is for whoever reads a log, not for an academy: the dialog refuses
-- first, in Spanish.
CREATE OR REPLACE FUNCTION "en_escena_guard_seminar_inscription_selected_price"() RETURNS trigger AS $$
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
  WHERE pa."seminar_inscription_id" = OLD."id";

  IF allocated_amount = 0 THEN
    RETURN NEW;
  END IF;

  SELECT ROUND(sp."amount"::numeric * s."required_deposit_percentage" / 100)
    INTO stored_deposit_amount
  FROM "en_escena_seminar_price" AS sp
  CROSS JOIN "en_escena_seminar" AS s
  WHERE sp."id" = OLD."selected_price_id"
    AND s."id" = OLD."seminar_id";

  IF stored_deposit_amount IS NOT NULL
     AND allocated_amount >= stored_deposit_amount
  THEN
    RAISE EXCEPTION 'Cannot change the selected price of a seminar inscription that has covered its deposit threshold.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "en_escena_seminar_inscription_selected_price_guard"
BEFORE UPDATE OF "selected_price_id" ON "en_escena_seminar_inscription"
FOR EACH ROW EXECUTE FUNCTION "en_escena_guard_seminar_inscription_selected_price"();

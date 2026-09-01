-- Fusión de los pares (#555, paso 1): hasta acá una inscripción podía tener dos
-- filas por pago, una por peldaño (`deposit` y `balance`). Sin el tipo, la
-- unicidad pasa a ser (pago, inscripción), así que los pares se suman en el
-- sobreviviente —el de `created_at` más viejo, desempatando por `id` para que
-- las dos sentencias elijan la misma fila— ANTES de crear el índice único, o la
-- migración falla sobre los duplicados. Nada referencia
-- `payment_allocation.id`, así que borrar las otras filas no arrastra nada.
WITH survivors AS (
  SELECT DISTINCT ON ("payment_id", "inscription_id") "id", "payment_id", "inscription_id"
  FROM "en_escena_payment_allocation"
  ORDER BY "payment_id", "inscription_id", "created_at" ASC, "id" ASC
), merged AS (
  SELECT s."id" AS survivor_id, SUM(pa."amount") AS total
  FROM survivors AS s
  JOIN "en_escena_payment_allocation" AS pa
    ON pa."payment_id" = s."payment_id"
   AND pa."inscription_id" = s."inscription_id"
  GROUP BY s."id"
)
UPDATE "en_escena_payment_allocation" AS pa
SET "amount" = merged.total, "updated_at" = CURRENT_TIMESTAMP
FROM merged
WHERE pa."id" = merged.survivor_id AND pa."amount" <> merged.total;--> statement-breakpoint
DELETE FROM "en_escena_payment_allocation" AS pa
WHERE pa."id" NOT IN (
  SELECT DISTINCT ON ("payment_id", "inscription_id") "id"
  FROM "en_escena_payment_allocation"
  ORDER BY "payment_id", "inscription_id", "created_at" ASC, "id" ASC
);--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" DROP CONSTRAINT "payment_allocation_payment_fk";
--> statement-breakpoint
DROP INDEX "payment_allocation_payment_inscription_type_unique";--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."en_escena_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocation_payment_inscription_unique" ON "en_escena_payment_allocation" USING btree ("payment_id","inscription_id");--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" DROP COLUMN "allocation_type";--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_amount_positive" CHECK ("en_escena_payment_allocation"."amount" > 0);--> statement-breakpoint
DROP TYPE "public"."en_escena_payment_allocation_type";--> statement-breakpoint
-- Price guard: an inscription's price row is fixed by its first allocation and
-- cannot move while it holds money, because the deposit threshold and the total
-- are derived from that price. The UI blocks it, and this enforces it in the
-- database, which is where the invariant holds for every write path. The text
-- is for whoever reads a log, not for the academy.
CREATE OR REPLACE FUNCTION "en_escena_guard_inscription_selected_price"() RETURNS trigger AS $$
BEGIN
  IF NEW."selected_price_id" IS DISTINCT FROM OLD."selected_price_id"
     AND EXISTS (
       SELECT 1
       FROM "en_escena_payment_allocation" AS pa
       WHERE pa."inscription_id" = OLD."id"
     )
  THEN
    RAISE EXCEPTION 'Cannot change the selected price of an inscription that holds allocations.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "en_escena_choreography_dancer_selected_price_guard"
BEFORE UPDATE OF "selected_price_id" ON "en_escena_choreography_dancer"
FOR EACH ROW EXECUTE FUNCTION "en_escena_guard_inscription_selected_price"();

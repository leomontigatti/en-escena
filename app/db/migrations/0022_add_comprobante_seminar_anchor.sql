-- The comprobante root learns a second anchor.
--
-- Hand-edited from the generated statements for one reason: `academy_id` is
-- NOT NULL and the table already holds rows, so the column is added nullable,
-- backfilled from each row's choreography, and only then tightened. The
-- snapshot is the generated one — it describes the schema, not the path taken
-- to it.
ALTER TABLE "en_escena_comprobante" ALTER COLUMN "choreography_id" DROP NOT NULL;--> statement-breakpoint
-- No cascade, deliberately, and unlike the allocation's seminar reference: an
-- anchor that was ever invoiced is permanently undeletable, and the block is
-- enforced in the application so it can say why in Spanish. A cascade here
-- would quietly destroy fiscal evidence instead.
ALTER TABLE "en_escena_comprobante" ADD COLUMN "seminar_id" varchar(255);--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD COLUMN "academy_id" varchar(255);--> statement-breakpoint
-- Backfill in the same migration, from the only place the academy was
-- derivable before this column existed: the anchor choreography. Every existing
-- row is a choreography row, so the join covers all of them and the NOT NULL
-- below lands on a full column.
UPDATE "en_escena_comprobante" AS c
SET "academy_id" = ch."academy_id"
FROM "en_escena_choreography" AS ch
WHERE ch."id" = c."choreography_id"
  AND c."academy_id" IS NULL;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ALTER COLUMN "academy_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_seminar_fk" FOREIGN KEY ("seminar_id") REFERENCES "public"."en_escena_seminar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- `(seminar, academy)` is the unit, so the index is keyed on the pair: every
-- read of a seminar comprobante is a read of what one academy holds in one
-- seminar.
CREATE INDEX "comprobante_seminar_idx" ON "en_escena_comprobante" USING btree ("seminar_id","academy_id","created_at");--> statement-breakpoint
-- Exactly one, unlike the line's `at most one`: a comprobante with no anchor
-- bills nothing, and one with two would belong to two units at once.
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_exactly_one_anchor" CHECK (num_nonnulls("en_escena_comprobante"."choreography_id", "en_escena_comprobante"."seminar_id") = 1);

-- A choreography gains a short number to search it by; what it means and why
-- it is unique per event rather than globally lives with `choreographies` in
-- `app/db/schema/choreographies.ts`. Only what is specific to this migration
-- stays here.
--
-- The counter table stops being called `event_financial_sequence`: it no
-- longer counts money alone. The `RENAME` preserves rows, the primary key and
-- the grants, so payment numbering already in flight never notices.
--
-- The column is born nullable and only becomes `NOT NULL` at the end: the
-- table has rows, and an `ADD COLUMN ... NOT NULL` with no default would
-- reject every one of them. The backfill numbers each event separately with
-- `ROW_NUMBER()`, ordered by creation date. The `id` tiebreak is not
-- decorative: a bulk insert shares `created_at` down to the microsecond, and
-- without it the order among those rows would be arbitrary — and therefore
-- different on each replica. Which particular number an old choreography got
-- does not matter; that it is unique within its event and stable does.
--
-- The unique index is created after the backfill, once there are no nulls left
-- for it to reject.
ALTER TABLE "en_escena_event_financial_sequence" RENAME TO "en_escena_event_sequence";--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" DROP CONSTRAINT "en_escena_event_financial_sequence_event_id_en_escena_event_id_fk";
--> statement-breakpoint
DROP INDEX "event_financial_sequence_updated_idx";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD COLUMN "choreography_number" integer;--> statement-breakpoint
UPDATE "en_escena_choreography" AS c
SET "choreography_number" = numbered."row_number"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "event_id"
      ORDER BY "created_at", "id"
    ) AS "row_number"
  FROM "en_escena_choreography"
) AS numbered
WHERE numbered."id" = c."id";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ALTER COLUMN "choreography_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" ADD COLUMN "next_choreography_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Every event that already has choreographies starts its counter after the
-- last number handed out. The `INSERT ... ON CONFLICT` covers both cases at
-- once: an event that never took a payment has no counter row and needs one,
-- while an event that does only updates the new field. An event with no
-- choreographies never appears here and starts at 1 through the default.
INSERT INTO "en_escena_event_sequence" ("event_id", "next_choreography_number")
SELECT "event_id", MAX("choreography_number") + 1
FROM "en_escena_choreography"
GROUP BY "event_id"
ON CONFLICT ("event_id") DO UPDATE
SET
  "next_choreography_number" = EXCLUDED."next_choreography_number",
  "updated_at" = CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" ADD CONSTRAINT "en_escena_event_sequence_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "choreography_event_number_unique" ON "en_escena_choreography" USING btree ("event_id","choreography_number");--> statement-breakpoint
CREATE INDEX "event_sequence_updated_idx" ON "en_escena_event_sequence" USING btree ("updated_at");

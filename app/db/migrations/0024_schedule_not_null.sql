-- A choreography always has a schedule. Every write that could resolve one to
-- no schedule is refused on the server (PRD #1070), so the column stops being
-- nullable and the "no schedule" state disappears from the app.
--
-- The backfill is a no-op in production, which was counted before this landed
-- and had no null row; it keeps the migration safe for older local copies,
-- where the choreography's schedule can be read back from its capacity. A row
-- with neither is left null on purpose: the statement below fails on it, and
-- the administrator reassigns or deletes it by hand.
UPDATE "en_escena_choreography" c SET "schedule_id" = sc."schedule_id"
FROM "en_escena_schedule_capacity" sc
WHERE c."schedule_capacity_id" = sc."id" AND c."schedule_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ALTER COLUMN "schedule_id" SET NOT NULL;

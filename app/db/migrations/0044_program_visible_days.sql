-- The program's visibility moves from one boolean per event to one row per
-- published day, so administration can publish the program day by day: a day
-- whose order may still change keeps its numbers away from the academies and
-- the public. See docs/domain/judging.md, "Program And Results".
--
-- The backfill below reads "program_visible", which migration 0045 drops right
-- after it in the same deploy.
CREATE TABLE "en_escena_program_visible_day" (
	"event_id" varchar(255) NOT NULL,
	"scheduled_date" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_program_visible_day" ADD CONSTRAINT "program_visible_day_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_visible_day_event_date_unique" ON "en_escena_program_visible_day" USING btree ("event_id","scheduled_date");--> statement-breakpoint
-- An event whose program was visible keeps every day it has a schedule on
-- today visible, which is exactly what the public and the academies saw. A day
-- added after this runs starts hidden, like any day nobody has published.
INSERT INTO "en_escena_program_visible_day" ("event_id", "scheduled_date")
SELECT DISTINCT "schedule"."event_id", "schedule"."scheduled_date"
FROM "en_escena_schedule" AS "schedule"
INNER JOIN "en_escena_event" AS "event" ON "event"."id" = "schedule"."event_id"
WHERE "event"."program_visible" = true;

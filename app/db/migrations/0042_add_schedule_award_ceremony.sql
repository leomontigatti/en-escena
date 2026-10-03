-- When a schedule's award ceremony happens, so the public program can tell the
-- audience where a block ends and the ceremony starts.
--
-- Two nullable text columns in the same shapes as "scheduled_date" and
-- "start_time" ('YYYY-MM-DD' and 'HH:MM'). Nullable because no schedule has a
-- ceremony yet and a schedule may never get one: existing rows arrive with
-- both null and no data moves. The date is free rather than tied to the
-- schedule's own day, because a ceremony after midnight falls on the next one.
ALTER TABLE "en_escena_schedule" ADD COLUMN "award_ceremony_date" text;--> statement-breakpoint
ALTER TABLE "en_escena_schedule" ADD COLUMN "award_ceremony_time" text;--> statement-breakpoint
-- The pair is one value: `num_nonnulls(...) <> 1` lets both be null or both
-- be set, and refuses a day without an hour or an hour without a day, which
-- the program could not announce. Every existing row has both null, so the
-- validating scan this takes passes at once.
ALTER TABLE "en_escena_schedule" ADD CONSTRAINT "schedule_award_ceremony_both_or_neither" CHECK (num_nonnulls("en_escena_schedule"."award_ceremony_date", "en_escena_schedule"."award_ceremony_time") <> 1);

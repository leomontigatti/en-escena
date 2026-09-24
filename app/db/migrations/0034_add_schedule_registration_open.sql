-- The manual open/closed switch of a cronograma. Every schedule arrives closed
-- and the ones of an event whose registration window is running right now are
-- reopened, so the switch starts where the window the event still carries left
-- it. That window is dropped in a later slice; this is the last thing to read it.
ALTER TABLE "en_escena_schedule" ADD COLUMN "registration_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "en_escena_schedule" SET "registration_open" = true
WHERE "event_id" IN (
	SELECT "id" FROM "en_escena_event"
	WHERE now() >= "registration_starts_at" AND now() <= "registration_ends_at"
);

-- The event's registration window retires (PRD #1154): inscriptions are opened
-- and closed by hand, one `Cronograma` at a time, through the
-- `registration_open` flag migration 0030 backfilled from these two columns.
-- The event-level fact is derived from the schedules, so nothing reads the
-- window any more.
-- reason: contract step shipped with its own expand because the expand already
-- happened in 0030 — the data moved to `en_escena_schedule.registration_open`
-- there, and every reader was retired before this migration. The old container's
-- selects of the columns fail for the length of the deploy, and what they would
-- have read is a window no rule consults.
-- squawk-ignore ban-drop-column
ALTER TABLE "en_escena_event" DROP COLUMN "registration_starts_at";--> statement-breakpoint
-- squawk-ignore ban-drop-column
ALTER TABLE "en_escena_event" DROP COLUMN "registration_ends_at";

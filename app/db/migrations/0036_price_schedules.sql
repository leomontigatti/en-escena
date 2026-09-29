-- A special price covers many schedules instead of one: the links move from
-- `en_escena_price.schedule_id` to `en_escena_price_schedule`, and the tier a
-- row belongs to moves to `is_special_price`, which is what the general tier's
-- unique index reads now that `schedule_id` no longer says it.
--
-- Expand step. `schedule_id` stays, unread, for the old container to keep
-- serving through the deploy; its contract step drops it. A special price the
-- old container writes in that window lands with `schedule_id` alone, no link
-- and the general flag, so the contract step re-runs the two backfills below
-- for any such row before dropping the column. Its foreign key goes
-- now, so that a schedule a price no longer covers can be deleted even while a
-- stale value still names it.
--
-- `price_general_unique` is hand-written with `NULLS NOT DISTINCT`, as migration
-- 0015 did, so the one deadline-less general price per group type collides with
-- itself; the snapshot carries it without the clause.
ALTER TABLE "en_escena_price" ADD COLUMN "is_special_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "en_escena_price" SET "is_special_price" = true WHERE "schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "en_escena_price_schedule" (
	"price_id" varchar(255) NOT NULL,
	"schedule_id" varchar(255) NOT NULL,
	"group_type" "en_escena_group_type" NOT NULL,
	"payment_deadline" text,
	CONSTRAINT "price_schedule_pk" PRIMARY KEY("price_id","schedule_id"),
	CONSTRAINT "price_schedule_tier_unique" UNIQUE NULLS NOT DISTINCT("schedule_id","group_type","payment_deadline")
);
--> statement-breakpoint
ALTER TABLE "en_escena_price_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "en_escena_price_schedule" ("price_id", "schedule_id", "group_type", "payment_deadline")
SELECT "id", "schedule_id", "group_type", "payment_deadline"
FROM "en_escena_price"
WHERE "schedule_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_price_schedule" ADD CONSTRAINT "price_schedule_price_fk" FOREIGN KEY ("price_id") REFERENCES "public"."en_escena_price"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_price_schedule" ADD CONSTRAINT "price_schedule_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_schedule_schedule_id_idx" ON "en_escena_price_schedule" USING btree ("schedule_id");--> statement-breakpoint
ALTER TABLE "en_escena_price" DROP CONSTRAINT "price_schedule_fk";--> statement-breakpoint
DROP INDEX "price_schedule_id_idx";--> statement-breakpoint
DROP INDEX "price_specific_unique";--> statement-breakpoint
DROP INDEX "price_general_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "price_general_unique" ON "en_escena_price" USING btree ("event_id","group_type","payment_deadline") NULLS NOT DISTINCT WHERE not "en_escena_price"."is_special_price";

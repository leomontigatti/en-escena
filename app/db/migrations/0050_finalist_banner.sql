-- The two `Gran final` banner pictures of a finalist academy within the event,
-- as storage keys. They belong to the academy, not to a pick, so a pick change
-- leaves them in place.
CREATE TABLE "en_escena_finalist_banner" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"first_storage_key" text,
	"second_storage_key" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_finalist_banner" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_banner" ADD CONSTRAINT "finalist_banner_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_banner" ADD CONSTRAINT "finalist_banner_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finalist_banner_event_academy_unique" ON "en_escena_finalist_banner" USING btree ("event_id","academy_id");--> statement-breakpoint
CREATE INDEX "finalist_banner_academy_idx" ON "en_escena_finalist_banner" USING btree ("academy_id");
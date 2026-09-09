CREATE TABLE "en_escena_seminar" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"instructor_name" text NOT NULL,
	"instructor_picture_storage_key" text,
	"scheduled_date" text NOT NULL,
	"start_time" text NOT NULL,
	"quota" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "seminar_quota_positive" CHECK ("en_escena_seminar"."quota" >= 1)
);
--> statement-breakpoint
ALTER TABLE "en_escena_seminar" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_seminar" ADD CONSTRAINT "seminar_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seminar_event_id_idx" ON "en_escena_seminar" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seminar_event_instructor_slot_unique" ON "en_escena_seminar" USING btree ("event_id","instructor_name","scheduled_date","start_time");
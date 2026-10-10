-- One judge's `finalistPick` per modality of the event, upserted on the unique
-- index. Eligibility is derived on read and checked by the save, not here. See
-- CONTEXT.md `finalistPick`.
CREATE TABLE "en_escena_finalist_pick" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"modality_id" varchar(255) NOT NULL,
	"judge_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_finalist_pick" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_pick" ADD CONSTRAINT "finalist_pick_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_pick" ADD CONSTRAINT "finalist_pick_modality_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_pick" ADD CONSTRAINT "finalist_pick_judge_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."en_escena_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_finalist_pick" ADD CONSTRAINT "finalist_pick_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finalist_pick_event_judge_modality_unique" ON "en_escena_finalist_pick" USING btree ("event_id","judge_id","modality_id");--> statement-breakpoint
CREATE INDEX "finalist_pick_academy_idx" ON "en_escena_finalist_pick" USING btree ("academy_id");
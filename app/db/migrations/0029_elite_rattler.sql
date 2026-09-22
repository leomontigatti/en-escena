CREATE TABLE "en_escena_schedule_category" (
	"schedule_id" varchar(255) NOT NULL,
	"category_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_schedule_category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_schedule_category" ADD CONSTRAINT "schedule_category_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_schedule_category" ADD CONSTRAINT "schedule_category_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_category_schedule_id_idx" ON "en_escena_schedule_category" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_category_category_id_idx" ON "en_escena_schedule_category" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_category_unique" ON "en_escena_schedule_category" USING btree ("schedule_id","category_id");
-- The judge assignment table: one judge put on one presentation, at most once.
--
-- No event column — the presentation names it — and no record of who assigned.
-- No cascade either, matching `presentation`: deleting a choreography deletes
-- its presentation's assignments explicitly, in the same transaction.
CREATE TABLE "en_escena_judge_assignment" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"presentation_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_judge_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_judge_assignment" ADD CONSTRAINT "judge_assignment_presentation_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."en_escena_presentation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_judge_assignment" ADD CONSTRAINT "judge_assignment_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "judge_assignment_presentation_user_unique" ON "en_escena_judge_assignment" USING btree ("presentation_id","user_id");--> statement-breakpoint
CREATE INDEX "judge_assignment_user_idx" ON "en_escena_judge_assignment" USING btree ("user_id");
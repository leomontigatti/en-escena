-- The `Gran final` vote codes: batches administration prints, each voidable
-- as a whole, and their one-time tokens, unique across every event.
CREATE TABLE "en_escena_vote_code_batch" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"number" integer NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_vote_code_batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_vote_code" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"batch_id" varchar(255) NOT NULL,
	"token" varchar(64) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_vote_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_vote_code_batch" ADD CONSTRAINT "vote_code_batch_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_vote_code" ADD CONSTRAINT "vote_code_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."en_escena_vote_code_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_code_batch_event_number_unique" ON "en_escena_vote_code_batch" USING btree ("event_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_code_token_unique" ON "en_escena_vote_code" USING btree ("token");--> statement-breakpoint
CREATE INDEX "vote_code_batch_idx" ON "en_escena_vote_code" USING btree ("batch_id");
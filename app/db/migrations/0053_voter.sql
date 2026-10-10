-- The `Gran final` voter (ADR-0018): its own table, outside the access domain,
-- keyed by provider and subject. A vote names a voter or a code, by its kind,
-- and a voter votes once per round, as a code does.
CREATE TYPE "public"."en_escena_voter_provider" AS ENUM('google');--> statement-breakpoint
CREATE TABLE "en_escena_voter" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider" "en_escena_voter_provider" NOT NULL,
	"subject" varchar(255) NOT NULL,
	"email_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_voter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD COLUMN "voter_id" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "voter_provider_subject_unique" ON "en_escena_voter" USING btree ("provider","subject");--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD CONSTRAINT "vote_voter_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."en_escena_voter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_round_voter_unique" ON "en_escena_vote" USING btree ("round_id","voter_id");--> statement-breakpoint
CREATE INDEX "vote_voter_idx" ON "en_escena_vote" USING btree ("voter_id");--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD CONSTRAINT "vote_kind_voter_check" CHECK (("en_escena_vote"."kind" = 'code' and "en_escena_vote"."voter_id" is null) or ("en_escena_vote"."kind" = 'social' and "en_escena_vote"."voter_id" is not null));

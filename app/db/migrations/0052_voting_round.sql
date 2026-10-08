-- The `Gran final` vote: rounds, the finalists each one copied when it opened,
-- and the votes, never updated or deleted. Their keys restrict, and a trigger
-- refuses any update or delete that reaches a vote row anyway.
CREATE TYPE "public"."en_escena_vote_kind" AS ENUM('code', 'social');--> statement-breakpoint
CREATE TABLE "en_escena_vote" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"round_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"kind" "en_escena_vote_kind" NOT NULL,
	"points" integer NOT NULL,
	"vote_code_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "vote_kind_points_check" CHECK (("en_escena_vote"."kind" = 'code' and "en_escena_vote"."points" = 10 and "en_escena_vote"."vote_code_id" is not null) or ("en_escena_vote"."kind" = 'social' and "en_escena_vote"."points" = 1 and "en_escena_vote"."vote_code_id" is null))
);
--> statement-breakpoint
ALTER TABLE "en_escena_vote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_voting_round_finalist" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"round_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"first_storage_key" text NOT NULL,
	"second_storage_key" text NOT NULL,
	CONSTRAINT "voting_round_finalist_round_academy_unique" UNIQUE("round_id","academy_id")
);
--> statement-breakpoint
ALTER TABLE "en_escena_voting_round_finalist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_voting_round" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"number" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "voting_round_number_check" CHECK ("en_escena_voting_round"."number" in (1, 2))
);
--> statement-breakpoint
ALTER TABLE "en_escena_voting_round" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD CONSTRAINT "vote_round_fk" FOREIGN KEY ("round_id") REFERENCES "public"."en_escena_voting_round"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD CONSTRAINT "vote_round_finalist_fk" FOREIGN KEY ("round_id","academy_id") REFERENCES "public"."en_escena_voting_round_finalist"("round_id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_vote" ADD CONSTRAINT "vote_code_fk" FOREIGN KEY ("vote_code_id") REFERENCES "public"."en_escena_vote_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_voting_round_finalist" ADD CONSTRAINT "voting_round_finalist_round_fk" FOREIGN KEY ("round_id") REFERENCES "public"."en_escena_voting_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_voting_round_finalist" ADD CONSTRAINT "voting_round_finalist_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_voting_round" ADD CONSTRAINT "voting_round_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_round_code_unique" ON "en_escena_vote" USING btree ("round_id","vote_code_id");--> statement-breakpoint
CREATE INDEX "vote_round_academy_idx" ON "en_escena_vote" USING btree ("round_id","academy_id");--> statement-breakpoint
CREATE INDEX "vote_code_idx" ON "en_escena_vote" USING btree ("vote_code_id");--> statement-breakpoint
CREATE INDEX "voting_round_finalist_academy_idx" ON "en_escena_voting_round_finalist" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voting_round_event_number_unique" ON "en_escena_voting_round" USING btree ("event_id","number");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "en_escena_refuse_vote_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A vote is never updated or deleted.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "en_escena_vote_append_only"
BEFORE UPDATE OR DELETE ON "en_escena_vote"
FOR EACH ROW EXECUTE FUNCTION "en_escena_refuse_vote_change"();

CREATE TYPE "public"."en_escena_criterion_kind" AS ENUM('adds', 'deducts');--> statement-breakpoint
CREATE TABLE "en_escena_score_criterion_value" (
	"score_id" varchar(255) NOT NULL,
	"criterion_id" varchar(255) NOT NULL,
	"value" numeric(4, 1) NOT NULL,
	CONSTRAINT "score_criterion_value_pk" PRIMARY KEY("score_id","criterion_id"),
	CONSTRAINT "score_criterion_value_non_negative" CHECK ("en_escena_score_criterion_value"."value" >= 0),
	CONSTRAINT "score_criterion_value_half_step" CHECK (mod("en_escena_score_criterion_value"."value" * 10, 5) = 0)
);
--> statement-breakpoint
ALTER TABLE "en_escena_score_criterion_value" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_score" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"judge_assignment_id" varchar(255) NOT NULL,
	"value" numeric(4, 1),
	"feedback_audio_storage_key" text,
	"annulled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "score_value_range" CHECK ("en_escena_score"."value" is null or ("en_escena_score"."value" >= 0 and "en_escena_score"."value" <= 100)),
	CONSTRAINT "score_value_half_step" CHECK ("en_escena_score"."value" is null or mod("en_escena_score"."value" * 10, 5) = 0)
);
--> statement-breakpoint
ALTER TABLE "en_escena_score" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_submodality_criterion" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"submodality_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"maximum" integer NOT NULL,
	"kind" "en_escena_criterion_kind" NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "submodality_criterion_maximum_whole" CHECK ("en_escena_submodality_criterion"."maximum" >= 1)
);
--> statement-breakpoint
ALTER TABLE "en_escena_submodality_criterion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_presentation" ADD COLUMN "disqualified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "en_escena_score_criterion_value" ADD CONSTRAINT "score_criterion_value_score_fk" FOREIGN KEY ("score_id") REFERENCES "public"."en_escena_score"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_score_criterion_value" ADD CONSTRAINT "score_criterion_value_criterion_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."en_escena_submodality_criterion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_score" ADD CONSTRAINT "en_escena_score_judge_assignment_id_en_escena_judge_assignment_id_fk" FOREIGN KEY ("judge_assignment_id") REFERENCES "public"."en_escena_judge_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_submodality_criterion" ADD CONSTRAINT "en_escena_submodality_criterion_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_submodality_criterion" ADD CONSTRAINT "en_escena_submodality_criterion_submodality_id_en_escena_submodality_id_fk" FOREIGN KEY ("submodality_id") REFERENCES "public"."en_escena_submodality"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_criterion_value_criterion_idx" ON "en_escena_score_criterion_value" USING btree ("criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_judge_assignment_unique" ON "en_escena_score" USING btree ("judge_assignment_id");--> statement-breakpoint
CREATE INDEX "submodality_criterion_submodality_idx" ON "en_escena_submodality_criterion" USING btree ("submodality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submodality_criterion_submodality_name_unique" ON "en_escena_submodality_criterion" USING btree ("submodality_id",lower("name"));--> statement-breakpoint
-- Hand-written, because "no more than the criterion's maximum" reads the
-- criterion row and a CHECK constraint cannot. It sits beside the two checks a
-- score criterion value can state on its own (non-negative, half-step) so that
-- the whole bound lives in the database and not only in validation.
--
-- The message is for whoever reads a log: the form refuses first, in Spanish.
CREATE OR REPLACE FUNCTION "en_escena_guard_score_criterion_value_maximum"() RETURNS trigger AS $$
DECLARE
  criterion_maximum integer;
BEGIN
  SELECT "maximum" INTO criterion_maximum
  FROM "en_escena_submodality_criterion"
  WHERE "id" = NEW."criterion_id";

  -- A missing criterion leaves this null and the comparison undecided; the
  -- foreign key is what refuses that row.
  IF NEW."value" > criterion_maximum THEN
    RAISE EXCEPTION 'score_criterion_value_within_maximum: value % is above the criterion maximum of %', NEW."value", criterion_maximum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "en_escena_score_criterion_value_maximum_guard"
BEFORE INSERT OR UPDATE OF "value", "criterion_id" ON "en_escena_score_criterion_value"
FOR EACH ROW EXECUTE FUNCTION "en_escena_guard_score_criterion_value_maximum"();

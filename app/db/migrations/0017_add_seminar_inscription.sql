CREATE TABLE "en_escena_seminar_inscription" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"seminar_id" varchar(255) NOT NULL,
	"dancer_id" varchar(255),
	"professor_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "seminar_inscription_exactly_one_person" CHECK (num_nonnulls("en_escena_seminar_inscription"."dancer_id", "en_escena_seminar_inscription"."professor_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD CONSTRAINT "seminar_inscription_seminar_fk" FOREIGN KEY ("seminar_id") REFERENCES "public"."en_escena_seminar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD CONSTRAINT "seminar_inscription_dancer_fk" FOREIGN KEY ("dancer_id") REFERENCES "public"."en_escena_dancer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD CONSTRAINT "seminar_inscription_professor_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."en_escena_professor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seminar_inscription_seminar_id_idx" ON "en_escena_seminar_inscription" USING btree ("seminar_id");--> statement-breakpoint
CREATE INDEX "seminar_inscription_dancer_id_idx" ON "en_escena_seminar_inscription" USING btree ("dancer_id");--> statement-breakpoint
CREATE INDEX "seminar_inscription_professor_id_idx" ON "en_escena_seminar_inscription" USING btree ("professor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seminar_inscription_seminar_dancer_unique" ON "en_escena_seminar_inscription" USING btree ("seminar_id","dancer_id") WHERE "en_escena_seminar_inscription"."dancer_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "seminar_inscription_seminar_professor_unique" ON "en_escena_seminar_inscription" USING btree ("seminar_id","professor_id") WHERE "en_escena_seminar_inscription"."professor_id" is not null;
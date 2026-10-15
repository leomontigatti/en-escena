ALTER TYPE "public"."en_escena_user_role" ADD VALUE 'individual';--> statement-breakpoint
CREATE TABLE "en_escena_individual" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"document_type" "en_escena_document_type" NOT NULL,
	"document_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_individual" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_individual" ADD CONSTRAINT "en_escena_individual_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "individual_academy_id_unique" ON "en_escena_individual" USING btree ("academy_id");
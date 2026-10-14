ALTER TABLE "en_escena_individual" ADD COLUMN "link_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "en_escena_individual" ADD COLUMN "link_confirmed_by_user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "en_escena_individual" ADD COLUMN "link_confirmed_document_number" text;--> statement-breakpoint
ALTER TABLE "en_escena_individual" ADD CONSTRAINT "en_escena_individual_link_confirmed_by_user_id_en_escena_user_id_fk" FOREIGN KEY ("link_confirmed_by_user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE set null ON UPDATE no action;
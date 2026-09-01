CREATE TYPE "public"."event_document_kind" AS ENUM('professor_contract', 'minor_authorization', 'adult_contract');--> statement-breakpoint
CREATE TABLE "en_escena_event_document" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"kind" "event_document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_event_document" ADD CONSTRAINT "en_escena_event_document_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_document_event_kind_unique" ON "en_escena_event_document" USING btree ("event_id","kind");
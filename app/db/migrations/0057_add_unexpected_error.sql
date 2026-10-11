CREATE TYPE "public"."en_escena_unexpected_error_source" AS ENUM('server', 'client');--> statement-breakpoint
CREATE TABLE "en_escena_unexpected_error" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"source" "en_escena_unexpected_error_source" NOT NULL,
	"signature" varchar(64) NOT NULL,
	"route" text NOT NULL,
	"method" varchar(16),
	"user_id" varchar(255),
	"release" varchar(64) NOT NULL,
	"stack" text NOT NULL,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_unexpected_error" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "unexpected_error_signature_created_at_idx" ON "en_escena_unexpected_error" USING btree ("signature","created_at");--> statement-breakpoint
CREATE INDEX "unexpected_error_created_at_idx" ON "en_escena_unexpected_error" USING btree ("created_at");
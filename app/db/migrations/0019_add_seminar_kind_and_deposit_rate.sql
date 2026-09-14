CREATE TYPE "public"."en_escena_seminar_kind" AS ENUM('regular', 'special');--> statement-breakpoint
ALTER TABLE "en_escena_seminar" ADD COLUMN "kind" "en_escena_seminar_kind" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_seminar" ADD COLUMN "required_deposit_percentage" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_seminar" ADD CONSTRAINT "seminar_required_deposit_percentage_range" CHECK ("en_escena_seminar"."required_deposit_percentage" between 1 and 99);
ALTER TABLE "en_escena_comprobante_inscription" DROP CONSTRAINT "comprobante_inscription_at_most_one_target";--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" DROP CONSTRAINT "comprobante_inscription_choreography_fk";
--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" DROP CONSTRAINT "comprobante_inscription_seminar_fk";
--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_choreography_fk" FOREIGN KEY ("choreography_inscription_id") REFERENCES "public"."en_escena_choreography_dancer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_seminar_fk" FOREIGN KEY ("seminar_inscription_id") REFERENCES "public"."en_escena_seminar_inscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_exactly_one_target" CHECK (num_nonnulls("en_escena_comprobante_inscription"."choreography_inscription_id", "en_escena_comprobante_inscription"."seminar_inscription_id") = 1);
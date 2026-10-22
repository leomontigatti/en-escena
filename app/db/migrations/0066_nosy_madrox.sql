CREATE TYPE "public"."en_escena_comprobante_reservation_state" AS ENUM('unverified', 'number-taken');--> statement-breakpoint
CREATE TABLE "en_escena_comprobante_reservation" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"pto_vta" integer NOT NULL,
	"cbte_tipo" integer NOT NULL,
	"cbte_nro" integer NOT NULL,
	"choreography_id" varchar(255),
	"seminar_id" varchar(255),
	"academy_id" varchar(255) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"imp_total" integer NOT NULL,
	"cbte_fch" text NOT NULL,
	"state" "en_escena_comprobante_reservation_state" DEFAULT 'unverified' NOT NULL,
	"taken_imp_total" integer,
	"taken_cbte_fch" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "comprobante_reservation_exactly_one_anchor" CHECK (num_nonnulls("en_escena_comprobante_reservation"."choreography_id", "en_escena_comprobante_reservation"."seminar_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_reservation" ADD CONSTRAINT "comprobante_reservation_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_reservation" ADD CONSTRAINT "comprobante_reservation_seminar_fk" FOREIGN KEY ("seminar_id") REFERENCES "public"."en_escena_seminar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_reservation" ADD CONSTRAINT "comprobante_reservation_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_reservation" ADD CONSTRAINT "comprobante_reservation_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_reservation_series_unique" ON "en_escena_comprobante_reservation" USING btree ("pto_vta","cbte_tipo");
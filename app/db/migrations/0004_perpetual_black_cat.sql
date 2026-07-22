CREATE TYPE "public"."en_escena_comprobante_issuer_iva_condition" AS ENUM('exento');--> statement-breakpoint
CREATE TABLE "en_escena_comprobante_inscription" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"comprobante_id" varchar(255) NOT NULL,
	"inscription_id" varchar(255),
	"amount" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_comprobante" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"choreography_id" varchar(255) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"cbte_tipo" integer NOT NULL,
	"pto_vta" integer NOT NULL,
	"cbte_nro" integer NOT NULL,
	"cbte_fch" text NOT NULL,
	"imp_total" integer NOT NULL,
	"issuer_cuit" text NOT NULL,
	"issuer_iva_condition" "en_escena_comprobante_issuer_iva_condition" NOT NULL,
	"receptor_doc_tipo" integer NOT NULL,
	"receptor_doc_nro" text NOT NULL,
	"receptor_iva_condition_id" integer NOT NULL,
	"cae" text NOT NULL,
	"cae_vto" text NOT NULL,
	"associated_comprobante_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_comprobante_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."en_escena_comprobante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante_inscription" ADD CONSTRAINT "comprobante_inscription_inscription_fk" FOREIGN KEY ("inscription_id") REFERENCES "public"."en_escena_choreography_dancer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD CONSTRAINT "comprobante_associated_fk" FOREIGN KEY ("associated_comprobante_id") REFERENCES "public"."en_escena_comprobante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_inscription_unique" ON "en_escena_comprobante_inscription" USING btree ("comprobante_id","inscription_id");--> statement-breakpoint
CREATE INDEX "comprobante_inscription_inscription_idx" ON "en_escena_comprobante_inscription" USING btree ("inscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_ptovta_tipo_nro_unique" ON "en_escena_comprobante" USING btree ("pto_vta","cbte_tipo","cbte_nro");--> statement-breakpoint
CREATE INDEX "comprobante_choreography_idx" ON "en_escena_comprobante" USING btree ("choreography_id","created_at");--> statement-breakpoint
CREATE INDEX "comprobante_event_idx" ON "en_escena_comprobante" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "comprobante_associated_idx" ON "en_escena_comprobante" USING btree ("associated_comprobante_id");
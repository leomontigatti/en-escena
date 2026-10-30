CREATE TABLE "en_escena_refund" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"refund_number" integer NOT NULL,
	"refund_date" text NOT NULL,
	"amount" integer NOT NULL,
	"refund_method" "en_escena_finance_payment_method" NOT NULL,
	"reference" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "refund_amount_positive" CHECK ("en_escena_refund"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" ADD COLUMN "next_refund_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_refund" ADD CONSTRAINT "en_escena_refund_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_refund" ADD CONSTRAINT "en_escena_refund_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_event_number_unique" ON "en_escena_refund" USING btree ("event_id","refund_number");--> statement-breakpoint
CREATE INDEX "refund_event_academy_idx" ON "en_escena_refund" USING btree ("event_id","academy_id","created_at");
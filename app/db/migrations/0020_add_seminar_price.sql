CREATE TABLE "en_escena_seminar_price" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"kind" "en_escena_seminar_kind" NOT NULL,
	"for_participants" boolean NOT NULL,
	"payment_deadline" text,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "seminar_price_cell_unique" UNIQUE NULLS NOT DISTINCT("event_id","kind","for_participants","payment_deadline"),
	CONSTRAINT "seminar_price_amount_positive" CHECK ("en_escena_seminar_price"."amount" >= 1)
);
--> statement-breakpoint
ALTER TABLE "en_escena_seminar_price" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD COLUMN "selected_price_id" varchar(255);--> statement-breakpoint
ALTER TABLE "en_escena_seminar_price" ADD CONSTRAINT "seminar_price_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seminar_price_event_id_idx" ON "en_escena_seminar_price" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "en_escena_seminar_inscription" ADD CONSTRAINT "seminar_inscription_selected_price_fk" FOREIGN KEY ("selected_price_id") REFERENCES "public"."en_escena_seminar_price"("id") ON DELETE no action ON UPDATE no action;
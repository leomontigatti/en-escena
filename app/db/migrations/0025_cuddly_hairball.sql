-- The presentation table: a choreography's place in the event's order.
--
-- Hand-edited after generation: the unique constraint on (event, order number)
-- is DEFERRABLE INITIALLY DEFERRED, which the Drizzle schema cannot express.
-- Renumbering a whole event happens inside one transaction and passes through
-- states where two rows share a number; deferring the check to commit is what
-- lets an in-place renumbering keep the presentation ids, and with them the
-- judge assignments hanging off them.
CREATE TABLE "en_escena_presentation" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"choreography_id" varchar(255) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"order_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "presentation_event_order_unique" UNIQUE("event_id","order_number") DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
ALTER TABLE "en_escena_presentation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_presentation" ADD CONSTRAINT "presentation_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_presentation" ADD CONSTRAINT "presentation_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_choreography_unique" ON "en_escena_presentation" USING btree ("choreography_id");--> statement-breakpoint
CREATE INDEX "presentation_event_order_idx" ON "en_escena_presentation" USING btree ("event_id","order_number");
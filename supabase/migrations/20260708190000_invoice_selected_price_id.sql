ALTER TABLE "public"."en_escena_academy_event_choreography_invoice"
ADD COLUMN "selected_price_id" character varying(255);

ALTER TABLE "public"."en_escena_academy_event_choreography_invoice"
ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_selected_price_i"
FOREIGN KEY ("selected_price_id") REFERENCES "public"."en_escena_price"("id");

CREATE INDEX "academy_event_choreography_invoice_selected_price_idx"
ON "public"."en_escena_academy_event_choreography_invoice"
USING "btree" ("selected_price_id");

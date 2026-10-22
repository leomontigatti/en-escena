DROP INDEX "comprobante_associated_unique";--> statement-breakpoint
CREATE INDEX "comprobante_associated_idx" ON "en_escena_comprobante" USING btree ("associated_comprobante_id");
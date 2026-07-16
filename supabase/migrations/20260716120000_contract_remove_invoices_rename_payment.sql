-- Contract del expand-contract (issue #284, PRD #279): se remueven el modelo
-- viejo de facturas/imputaciones y los campos de auditoría/anulación de pagos, y
-- se renombra la entidad de pagos a `payment` ahora que nada los usa.

-- 1. Dropear tablas de facturas de coreografía e imputaciones (la imputación
--    referencia a factura y pago, así que se dropea primero).
DROP TABLE IF EXISTS "public"."en_escena_academy_event_invoice_imputation";
DROP TABLE IF EXISTS "public"."en_escena_academy_event_choreography_invoice";

-- 2. Dropear el enum de tipo de factura.
DROP TYPE IF EXISTS "public"."en_escena_choreography_invoice_type";

-- 3. Quitar el contador de facturas de la secuencia financiera.
ALTER TABLE "public"."en_escena_event_financial_sequence"
DROP COLUMN IF EXISTS "next_invoice_number";

-- 4. Quitar los campos de auditoría/anulación de pagos (al dropear las columnas
--    se dropean también sus foreign keys a `en_escena_user`).
ALTER TABLE "public"."en_escena_academy_event_payment"
  DROP COLUMN IF EXISTS "annulled_at",
  DROP COLUMN IF EXISTS "annulled_reason",
  DROP COLUMN IF EXISTS "annulled_by_user_id",
  DROP COLUMN IF EXISTS "created_by_user_id";

-- 5. Renombrar la entidad de pagos a su tabla física `payment`, con su primary
--    key, índices y unicidad renombrados en consecuencia.
ALTER TABLE "public"."en_escena_academy_event_payment"
RENAME TO "en_escena_payment";

ALTER INDEX "public"."en_escena_academy_event_payment_pkey"
RENAME TO "en_escena_payment_pkey";

ALTER INDEX "public"."academy_event_payment_event_number_unique"
RENAME TO "payment_event_number_unique";

ALTER INDEX "public"."academy_event_payment_event_academy_idx"
RENAME TO "payment_event_academy_idx";

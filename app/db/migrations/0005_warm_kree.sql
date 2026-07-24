CREATE TYPE "public"."en_escena_comprobante_porcion" AS ENUM('seña', 'saldo', 'total');--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD COLUMN "porcion" "en_escena_comprobante_porcion" DEFAULT 'total' NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD COLUMN "fch_serv_desde" text;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD COLUMN "fch_serv_hasta" text;--> statement-breakpoint
ALTER TABLE "en_escena_comprobante" ADD COLUMN "fch_vto_pago" text;--> statement-breakpoint
-- Backfill (ADR-0011): la columna entra con default `total`, así que las filas
-- existentes ya son NOT NULL válidas. Acá se corrige la porción de la única
-- factura preexistente derivándola de las asignaciones de pago que cubren sus
-- inscripciones: `deposit` (seña) + `balance` (saldo) → `total`, sólo `deposit`
-- → `seña`, sólo `balance` → `saldo`. Las tres fechas de servicio quedan NULL:
-- se emitió como Concepto 1 (producto) y nunca las cargó.
UPDATE "en_escena_comprobante" AS c
SET "porcion" = agg."porcion"
FROM (
  SELECT
    ci."comprobante_id" AS comprobante_id,
    (CASE
      WHEN bool_or(pa."allocation_type" = 'deposit')
        AND bool_or(pa."allocation_type" = 'balance') THEN 'total'
      WHEN bool_or(pa."allocation_type" = 'deposit') THEN 'seña'
      WHEN bool_or(pa."allocation_type" = 'balance') THEN 'saldo'
    END)::"public"."en_escena_comprobante_porcion" AS porcion
  FROM "en_escena_comprobante_inscription" AS ci
  JOIN "en_escena_payment_allocation" AS pa
    ON pa."inscription_id" = ci."inscription_id"
  GROUP BY ci."comprobante_id"
) AS agg
WHERE c."id" = agg.comprobante_id AND agg."porcion" IS NOT NULL;--> statement-breakpoint
-- Una Nota de crédito espeja la porción de la factura que anula.
UPDATE "en_escena_comprobante" AS nc
SET "porcion" = f."porcion"
FROM "en_escena_comprobante" AS f
WHERE nc."associated_comprobante_id" = f."id";
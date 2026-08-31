-- La coreografía gana un número corto por el que buscarla; qué significa y por
-- qué es único por evento y no globalmente está en `choreographies` en
-- `app/db/schema/choreographies.ts`. Acá queda lo propio de esta migración.
--
-- La tabla de contadores deja de llamarse `event_financial_sequence`: ya no
-- cuenta solo plata. El `RENAME` conserva filas, la clave primaria y los
-- permisos, así que la numeración de pagos en curso no se entera.
--
-- La columna nace nullable y recién al final es `NOT NULL`: la tabla tiene
-- filas y un `ADD COLUMN ... NOT NULL` sin default las rechazaría a todas. El
-- relleno numera cada evento por separado con `ROW_NUMBER()`, ordenando por
-- fecha de creación. El desempate por `id` no es decorativo: una alta masiva
-- comparte `created_at` al microsegundo y sin él el orden sería arbitrario
-- entre esas filas —y por lo tanto distinto en cada réplica—. Qué número
-- concreto recibió cada coreografía vieja da igual; que sea único dentro del
-- evento y estable, no.
--
-- El índice único se crea después del relleno, cuando ya no hay nulos que
-- pueda rechazar.
ALTER TABLE "en_escena_event_financial_sequence" RENAME TO "en_escena_event_sequence";--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" DROP CONSTRAINT "en_escena_event_financial_sequence_event_id_en_escena_event_id_fk";
--> statement-breakpoint
DROP INDEX "event_financial_sequence_updated_idx";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD COLUMN "choreography_number" integer;--> statement-breakpoint
UPDATE "en_escena_choreography" AS c
SET "choreography_number" = numbered."row_number"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "event_id"
      ORDER BY "created_at", "id"
    ) AS "row_number"
  FROM "en_escena_choreography"
) AS numbered
WHERE numbered."id" = c."id";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ALTER COLUMN "choreography_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" ADD COLUMN "next_choreography_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Cada evento que ya tiene coreografías arranca su contador después del último
-- número repartido. El `INSERT ... ON CONFLICT` cubre los dos casos de una vez:
-- el evento que nunca cobró un pago no tiene fila de contador y la necesita, y
-- el que sí la tiene solo actualiza el nuevo campo. Un evento sin coreografías
-- no aparece acá y arranca en 1 por el default.
INSERT INTO "en_escena_event_sequence" ("event_id", "next_choreography_number")
SELECT "event_id", MAX("choreography_number") + 1
FROM "en_escena_choreography"
GROUP BY "event_id"
ON CONFLICT ("event_id") DO UPDATE
SET
  "next_choreography_number" = EXCLUDED."next_choreography_number",
  "updated_at" = CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "en_escena_event_sequence" ADD CONSTRAINT "en_escena_event_sequence_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "choreography_event_number_unique" ON "en_escena_choreography" USING btree ("event_id","choreography_number");--> statement-breakpoint
CREATE INDEX "event_sequence_updated_idx" ON "en_escena_event_sequence" USING btree ("updated_at");

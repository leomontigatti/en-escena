-- Retiro blando de una inscripción (#555, paso 4). Sin backfill: toda fila
-- existente está activa, y `null` es exactamente eso. La columna es lo único
-- que se persiste del retiro; el estado financiero sigue derivándose de
-- `Σ asignaciones`.
ALTER TABLE "en_escena_choreography_dancer" ADD COLUMN "withdrawn_at" timestamp with time zone;
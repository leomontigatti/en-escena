-- Fundaciones del modelo de inscripciones (#281, PRD #279).
--
-- Este SQL faltaba: el ticket #281 solo actualizó el esquema TS y los tests, sin
-- escribir la migración de Supabase equivalente. Sin esto, aplicar el resto de la
-- cadena a producción deja un esquema sin `en_escena_payment_allocation` ni las
-- columnas de inscripción, y la app crashea en las consultas de finanzas.
--
-- Es aditivo y seguro: producción tiene finanzas greenfield (sin pagos ni
-- asignaciones todavía). Debe aplicarse ANTES del contract
-- (20260716120000_contract_remove_invoices_rename_payment.sql) porque referencia
-- `en_escena_academy_event_payment` por su nombre previo al rename (el rename de
-- Postgres preserva las FK automáticamente).

-- ---------------------------------------------------------------------------
-- 1. Inscripción: identidad estable + snapshots de seña y saldo sobre
--    en_escena_choreography_dancer.
-- ---------------------------------------------------------------------------

-- 1a. Columna id: agregar nullable, backfill con UUID, NOT NULL + PRIMARY KEY.
ALTER TABLE "public"."en_escena_choreography_dancer"
    ADD COLUMN "id" character varying(255);

UPDATE "public"."en_escena_choreography_dancer"
SET "id" = gen_random_uuid()::text
WHERE "id" IS NULL;

ALTER TABLE "public"."en_escena_choreography_dancer"
    ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE ONLY "public"."en_escena_choreography_dancer"
    ADD CONSTRAINT "en_escena_choreography_dancer_pkey" PRIMARY KEY ("id");

-- 1b. Snapshots de seña y saldo. Todas nullable: las inscripciones existentes
--     quedan sin snapshot, es decir en estado impaga.
ALTER TABLE "public"."en_escena_choreography_dancer"
    ADD COLUMN "frozen_base_price_amount" integer,
    ADD COLUMN "selected_price_id" character varying(255),
    ADD COLUMN "deposit_reference_date" text,
    ADD COLUMN "deposit_percentage" integer,
    ADD COLUMN "deposit_amount" integer,
    ADD COLUMN "balance_reference_date" text,
    ADD COLUMN "applied_dancer_discount_percentage" integer,
    ADD COLUMN "applied_dancer_discount_amount" integer,
    ADD COLUMN "final_total_amount" integer,
    ADD COLUMN "balance_amount" integer,
    ADD COLUMN "balance_completed_at" text;

-- 1c. FK de selected_price_id → prices, e índice de lookup.
ALTER TABLE ONLY "public"."en_escena_choreography_dancer"
    ADD CONSTRAINT "choreography_dancer_selected_price_fk"
    FOREIGN KEY ("selected_price_id") REFERENCES "public"."en_escena_price"("id");

CREATE INDEX "choreography_dancer_selected_price_idx"
    ON "public"."en_escena_choreography_dancer" USING "btree" ("selected_price_id");

-- ---------------------------------------------------------------------------
-- 2. Asignación de pago: en_escena_payment_allocation.
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."en_escena_payment_allocation_type" AS ENUM (
    'deposit',
    'balance'
);

ALTER TYPE "public"."en_escena_payment_allocation_type" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."en_escena_payment_allocation" (
    "id" character varying(255) NOT NULL,
    "payment_id" character varying(255) NOT NULL,
    "inscription_id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "allocation_type" "public"."en_escena_payment_allocation_type" NOT NULL,
    "amount" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."en_escena_payment_allocation" OWNER TO "postgres";

ALTER TABLE ONLY "public"."en_escena_payment_allocation"
    ADD CONSTRAINT "en_escena_payment_allocation_pkey" PRIMARY KEY ("id");

-- FK a pagos: referencia el nombre previo al rename; el rename del contract la
-- preserva y la reapunta a en_escena_payment automáticamente.
ALTER TABLE ONLY "public"."en_escena_payment_allocation"
    ADD CONSTRAINT "payment_allocation_payment_fk"
    FOREIGN KEY ("payment_id") REFERENCES "public"."en_escena_academy_event_payment"("id");

ALTER TABLE ONLY "public"."en_escena_payment_allocation"
    ADD CONSTRAINT "payment_allocation_inscription_fk"
    FOREIGN KEY ("inscription_id") REFERENCES "public"."en_escena_choreography_dancer"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."en_escena_payment_allocation"
    ADD CONSTRAINT "payment_allocation_academy_fk"
    FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."en_escena_payment_allocation"
    ADD CONSTRAINT "payment_allocation_event_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "payment_allocation_payment_inscription_type_unique"
    ON "public"."en_escena_payment_allocation" USING "btree" ("payment_id", "inscription_id", "allocation_type");

CREATE INDEX "payment_allocation_inscription_idx"
    ON "public"."en_escena_payment_allocation" USING "btree" ("inscription_id", "created_at");

CREATE INDEX "payment_allocation_payment_idx"
    ON "public"."en_escena_payment_allocation" USING "btree" ("payment_id", "created_at");

CREATE INDEX "payment_allocation_event_academy_idx"
    ON "public"."en_escena_payment_allocation" USING "btree" ("event_id", "academy_id", "created_at");

-- RLS + grants, replicando la convención del baseline para el resto de tablas.
ALTER TABLE "public"."en_escena_payment_allocation" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."en_escena_payment_allocation" TO "anon";
GRANT ALL ON TABLE "public"."en_escena_payment_allocation" TO "authenticated";
GRANT ALL ON TABLE "public"."en_escena_payment_allocation" TO "service_role";

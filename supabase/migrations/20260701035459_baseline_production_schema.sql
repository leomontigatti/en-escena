


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."en_escena_administrative_audit_action" AS ENUM (
    'create',
    'update',
    'archive',
    'reactivate',
    'reset-password',
    'verify-identity'
);


ALTER TYPE "public"."en_escena_administrative_audit_action" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_administrative_audit_entity_type" AS ENUM (
    'professor',
    'dancer',
    'choreography',
    'user'
);


ALTER TYPE "public"."en_escena_administrative_audit_entity_type" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_choreography_category_calculation_mode" AS ENUM (
    'oldest',
    'group_tolerance',
    'group_average'
);


ALTER TYPE "public"."en_escena_choreography_category_calculation_mode" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_choreography_invoice_type" AS ENUM (
    'sena',
    'saldo'
);


ALTER TYPE "public"."en_escena_choreography_invoice_type" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_document_type" AS ENUM (
    'dni',
    'passport',
    'other'
);


ALTER TYPE "public"."en_escena_document_type" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_finance_payment_method" AS ENUM (
    'transferencia',
    'efectivo',
    'mercado_pago',
    'otro'
);


ALTER TYPE "public"."en_escena_finance_payment_method" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_group_type" AS ENUM (
    'solo',
    'duo',
    'trio',
    'grupal'
);


ALTER TYPE "public"."en_escena_group_type" OWNER TO "postgres";


CREATE TYPE "public"."en_escena_user_role" AS ENUM (
    'academy',
    'admin',
    'auditor',
    'judge'
);


ALTER TYPE "public"."en_escena_user_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."en_escena_academy" (
    "id" character varying(255) NOT NULL,
    "user_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_academy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_academy_event_choreography_invoice" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "choreography_id" character varying(255) NOT NULL,
    "invoice_number" integer NOT NULL,
    "invoice_type" "public"."en_escena_choreography_invoice_type" NOT NULL,
    "issue_date" "text" NOT NULL,
    "base_price_amount" integer NOT NULL,
    "selected_payment_deadline" "text",
    "required_deposit_percentage_snapshot" integer NOT NULL,
    "deposit_amount" integer NOT NULL,
    "deposit_completed_on" "text",
    "applied_deposit_amount" integer,
    "dancer_discount_amount" integer,
    "administrative_discount_amount" integer,
    "administrative_discount_internal_reason" "text",
    "administrative_discount_public_label" "text",
    "total_discount_amount" integer,
    "final_total_amount" integer,
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" "text",
    "created_by_user_id" character varying(255) NOT NULL,
    "cancelled_by_user_id" character varying(255),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_academy_event_choreography_invoice" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_academy_event_invoice_imputation" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "payment_id" character varying(255) NOT NULL,
    "invoice_id" character varying(255) NOT NULL,
    "amount" integer NOT NULL,
    "imputation_date" "text" NOT NULL,
    "annulled_at" timestamp with time zone,
    "annulled_reason" "text",
    "created_by_user_id" character varying(255) NOT NULL,
    "annulled_by_user_id" character varying(255),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_academy_event_invoice_imputation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_academy_event_payment" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "payment_number" integer NOT NULL,
    "payment_date" "text" NOT NULL,
    "amount" integer NOT NULL,
    "payment_method" "public"."en_escena_finance_payment_method" NOT NULL,
    "reference" "text",
    "internal_note" "text",
    "annulled_at" timestamp with time zone,
    "annulled_reason" "text",
    "created_by_user_id" character varying(255) NOT NULL,
    "annulled_by_user_id" character varying(255),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_academy_event_payment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_access_credential" (
    "id" character varying(255) NOT NULL,
    "user_id" character varying(255) NOT NULL,
    "password_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_access_credential" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_access_session" (
    "id" character varying(255) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "user_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."en_escena_access_session" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_administrative_audit_entry" (
    "id" character varying(255) NOT NULL,
    "entity_type" "public"."en_escena_administrative_audit_entity_type" NOT NULL,
    "entity_id" character varying(255) NOT NULL,
    "event_id" character varying(255),
    "admin_user_id" character varying(255) NOT NULL,
    "action" "public"."en_escena_administrative_audit_action" NOT NULL,
    "reason" "text",
    "before_values" "jsonb" NOT NULL,
    "after_values" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_administrative_audit_entry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_category" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "min_age" integer NOT NULL,
    "max_age" integer NOT NULL,
    "group_types" "public"."en_escena_group_type"[] NOT NULL,
    "group_type_key" "text" NOT NULL,
    "experience_level_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_category" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_category_experience_level" (
    "category_id" character varying(255) NOT NULL,
    "experience_level_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."en_escena_category_experience_level" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_category_modality" (
    "category_id" character varying(255) NOT NULL,
    "modality_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."en_escena_category_modality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_choreography" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "modality_id" character varying(255) NOT NULL,
    "submodality_id" character varying(255),
    "group_type" "public"."en_escena_group_type" NOT NULL,
    "category_id" character varying(255),
    "category_age_basis" integer,
    "category_calculation_mode" "public"."en_escena_choreography_category_calculation_mode" NOT NULL,
    "experience_level_id" character varying(255),
    "schedule_capacity_id" character varying(255),
    "music_storage_key" "text",
    "has_presentation" boolean DEFAULT false NOT NULL,
    "has_active_financial_link" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "schedule_id" character varying(255)
);


ALTER TABLE "public"."en_escena_choreography" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_choreography_dancer" (
    "choreography_id" character varying(255) NOT NULL,
    "dancer_id" character varying(255) NOT NULL,
    "age_at_event_start" integer NOT NULL
);


ALTER TABLE "public"."en_escena_choreography_dancer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_choreography_professor" (
    "choreography_id" character varying(255) NOT NULL,
    "professor_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."en_escena_choreography_professor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_dancer" (
    "id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "birth_date" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "document_type" "public"."en_escena_document_type",
    "document_number" "text",
    "document_front_image_storage_key" "text",
    "document_back_image_storage_key" "text",
    "identity_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_dancer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_event" (
    "id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "program_visible" boolean DEFAULT false NOT NULL,
    "results_visible" boolean DEFAULT false NOT NULL,
    "required_deposit_percentage" integer DEFAULT 30 NOT NULL,
    "registration_starts_at" timestamp with time zone NOT NULL,
    "registration_ends_at" timestamp with time zone NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "registration_ready" boolean DEFAULT false NOT NULL,
    "registration_readiness_missing_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "registration_readiness_dirty" boolean DEFAULT true NOT NULL,
    "registration_readiness_calculated_at" timestamp with time zone
);


ALTER TABLE "public"."en_escena_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_event_financial_sequence" (
    "event_id" character varying(255) NOT NULL,
    "next_payment_number" integer DEFAULT 1 NOT NULL,
    "next_invoice_number" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_event_financial_sequence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_experience_level" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_experience_level" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_internal_user_invitation" (
    "id" character varying(255) NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."en_escena_user_role" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_internal_user_invitation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_modality" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_modality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_price" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "schedule_id" character varying(255),
    "group_type" "public"."en_escena_group_type" NOT NULL,
    "payment_deadline" "text",
    "amount" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."en_escena_price" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_professor" (
    "id" character varying(255) NOT NULL,
    "academy_id" character varying(255) NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "document_type" "public"."en_escena_document_type",
    "document_number" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_professor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_schedule" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "scheduled_date" "text" NOT NULL,
    "start_time" "text" NOT NULL,
    "total_capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_schedule_capacity" (
    "id" character varying(255) NOT NULL,
    "schedule_id" character varying(255) NOT NULL,
    "group_type" "public"."en_escena_group_type" NOT NULL,
    "capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_schedule_capacity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_schedule_modality" (
    "schedule_id" character varying(255) NOT NULL,
    "modality_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."en_escena_schedule_modality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_submodality" (
    "id" character varying(255) NOT NULL,
    "event_id" character varying(255) NOT NULL,
    "modality_id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_submodality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."en_escena_user" (
    "id" character varying(255) NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "image" "text",
    "role" "public"."en_escena_user_role" DEFAULT 'academy'::"public"."en_escena_user_role" NOT NULL,
    "internal_username" "text",
    "requires_password_change" boolean DEFAULT false NOT NULL,
    "suspended" boolean DEFAULT false NOT NULL,
    "session_invalid_before" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."en_escena_user" OWNER TO "postgres";


ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_payment"
    ADD CONSTRAINT "en_escena_academy_event_payment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_academy"
    ADD CONSTRAINT "en_escena_academy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_access_credential"
    ADD CONSTRAINT "en_escena_access_credential_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_access_session"
    ADD CONSTRAINT "en_escena_access_session_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_access_session"
    ADD CONSTRAINT "en_escena_access_session_token_unique" UNIQUE ("token");



ALTER TABLE ONLY "public"."en_escena_administrative_audit_entry"
    ADD CONSTRAINT "en_escena_administrative_audit_entry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_category"
    ADD CONSTRAINT "en_escena_category_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "en_escena_choreography_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_dancer"
    ADD CONSTRAINT "en_escena_dancer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_event_financial_sequence"
    ADD CONSTRAINT "en_escena_event_financial_sequence_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."en_escena_event"
    ADD CONSTRAINT "en_escena_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_experience_level"
    ADD CONSTRAINT "en_escena_experience_level_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_internal_user_invitation"
    ADD CONSTRAINT "en_escena_internal_user_invitation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_modality"
    ADD CONSTRAINT "en_escena_modality_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_price"
    ADD CONSTRAINT "en_escena_price_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_professor"
    ADD CONSTRAINT "en_escena_professor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_schedule_capacity"
    ADD CONSTRAINT "en_escena_schedule_capacity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_schedule"
    ADD CONSTRAINT "en_escena_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_submodality"
    ADD CONSTRAINT "en_escena_submodality_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."en_escena_user"
    ADD CONSTRAINT "en_escena_user_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."en_escena_user"
    ADD CONSTRAINT "en_escena_user_internal_username_unique" UNIQUE ("internal_username");



ALTER TABLE ONLY "public"."en_escena_user"
    ADD CONSTRAINT "en_escena_user_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "academy_event_choreography_invoice_active_unique" ON "public"."en_escena_academy_event_choreography_invoice" USING "btree" ("choreography_id", "invoice_type") WHERE ("cancelled_at" IS NULL);



CREATE INDEX "academy_event_choreography_invoice_choreography_idx" ON "public"."en_escena_academy_event_choreography_invoice" USING "btree" ("choreography_id", "created_at");



CREATE INDEX "academy_event_choreography_invoice_event_academy_idx" ON "public"."en_escena_academy_event_choreography_invoice" USING "btree" ("event_id", "academy_id", "created_at");



CREATE UNIQUE INDEX "academy_event_choreography_invoice_event_number_unique" ON "public"."en_escena_academy_event_choreography_invoice" USING "btree" ("event_id", "invoice_number");



CREATE INDEX "academy_event_invoice_imputation_event_academy_idx" ON "public"."en_escena_academy_event_invoice_imputation" USING "btree" ("event_id", "academy_id", "created_at");



CREATE INDEX "academy_event_invoice_imputation_invoice_idx" ON "public"."en_escena_academy_event_invoice_imputation" USING "btree" ("invoice_id", "created_at");



CREATE INDEX "academy_event_invoice_imputation_payment_idx" ON "public"."en_escena_academy_event_invoice_imputation" USING "btree" ("payment_id", "created_at");



CREATE INDEX "academy_event_payment_event_academy_idx" ON "public"."en_escena_academy_event_payment" USING "btree" ("event_id", "academy_id", "created_at");



CREATE UNIQUE INDEX "academy_event_payment_event_number_unique" ON "public"."en_escena_academy_event_payment" USING "btree" ("event_id", "payment_number");



CREATE UNIQUE INDEX "academy_user_id_unique" ON "public"."en_escena_academy" USING "btree" ("user_id");



CREATE UNIQUE INDEX "access_credential_user_id_unique" ON "public"."en_escena_access_credential" USING "btree" ("user_id");



CREATE INDEX "access_session_user_id_idx" ON "public"."en_escena_access_session" USING "btree" ("user_id");



CREATE INDEX "administrative_audit_entry_admin_user_idx" ON "public"."en_escena_administrative_audit_entry" USING "btree" ("admin_user_id");



CREATE INDEX "administrative_audit_entry_entity_idx" ON "public"."en_escena_administrative_audit_entry" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "administrative_audit_entry_event_idx" ON "public"."en_escena_administrative_audit_entry" USING "btree" ("event_id");



CREATE INDEX "category_event_age_range_idx" ON "public"."en_escena_category" USING "btree" ("event_id", "min_age", "max_age");



CREATE INDEX "category_event_id_idx" ON "public"."en_escena_category" USING "btree" ("event_id");



CREATE INDEX "category_experience_level_level_id_idx" ON "public"."en_escena_category_experience_level" USING "btree" ("experience_level_id");



CREATE UNIQUE INDEX "category_experience_level_unique" ON "public"."en_escena_category_experience_level" USING "btree" ("category_id", "experience_level_id");



CREATE INDEX "category_modality_modality_id_idx" ON "public"."en_escena_category_modality" USING "btree" ("modality_id");



CREATE UNIQUE INDEX "category_modality_unique" ON "public"."en_escena_category_modality" USING "btree" ("category_id", "modality_id");



CREATE INDEX "choreography_dancer_dancer_id_idx" ON "public"."en_escena_choreography_dancer" USING "btree" ("dancer_id");



CREATE UNIQUE INDEX "choreography_dancer_unique" ON "public"."en_escena_choreography_dancer" USING "btree" ("choreography_id", "dancer_id");



CREATE INDEX "choreography_event_academy_created_idx" ON "public"."en_escena_choreography" USING "btree" ("event_id", "academy_id", "created_at");



CREATE INDEX "choreography_professor_professor_id_idx" ON "public"."en_escena_choreography_professor" USING "btree" ("professor_id");



CREATE UNIQUE INDEX "choreography_professor_unique" ON "public"."en_escena_choreography_professor" USING "btree" ("choreography_id", "professor_id");



CREATE INDEX "choreography_schedule_capacity_id_idx" ON "public"."en_escena_choreography" USING "btree" ("schedule_capacity_id");



CREATE INDEX "choreography_schedule_id_idx" ON "public"."en_escena_choreography" USING "btree" ("schedule_id");



CREATE UNIQUE INDEX "dancer_academy_document_unique" ON "public"."en_escena_dancer" USING "btree" ("academy_id", "document_type", "document_number") WHERE (("document_type" IS NOT NULL) AND ("document_number" IS NOT NULL));



CREATE INDEX "dancer_academy_id_idx" ON "public"."en_escena_dancer" USING "btree" ("academy_id");



CREATE INDEX "dancer_academy_name_idx" ON "public"."en_escena_dancer" USING "btree" ("academy_id", "last_name", "first_name");



CREATE INDEX "event_financial_sequence_updated_idx" ON "public"."en_escena_event_financial_sequence" USING "btree" ("updated_at");



CREATE UNIQUE INDEX "event_single_active_unique" ON "public"."en_escena_event" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "experience_level_event_id_idx" ON "public"."en_escena_experience_level" USING "btree" ("event_id");



CREATE UNIQUE INDEX "experience_level_event_name_unique" ON "public"."en_escena_experience_level" USING "btree" ("event_id", "name");



CREATE INDEX "internal_user_invitation_email_idx" ON "public"."en_escena_internal_user_invitation" USING "btree" ("email");



CREATE UNIQUE INDEX "internal_user_invitation_token_hash_unique" ON "public"."en_escena_internal_user_invitation" USING "btree" ("token_hash");



CREATE INDEX "modality_event_id_idx" ON "public"."en_escena_modality" USING "btree" ("event_id");



CREATE UNIQUE INDEX "modality_event_name_unique" ON "public"."en_escena_modality" USING "btree" ("event_id", "name");



CREATE INDEX "price_event_id_idx" ON "public"."en_escena_price" USING "btree" ("event_id");



CREATE UNIQUE INDEX "price_general_unique" ON "public"."en_escena_price" USING "btree" ("event_id", "group_type", "payment_deadline") WHERE ("schedule_id" IS NULL);



CREATE INDEX "price_schedule_id_idx" ON "public"."en_escena_price" USING "btree" ("schedule_id");



CREATE UNIQUE INDEX "price_specific_unique" ON "public"."en_escena_price" USING "btree" ("event_id", "group_type", "schedule_id", "payment_deadline") WHERE ("schedule_id" IS NOT NULL);



CREATE UNIQUE INDEX "professor_academy_document_unique" ON "public"."en_escena_professor" USING "btree" ("academy_id", "document_type", "document_number") WHERE (("document_type" IS NOT NULL) AND ("document_number" IS NOT NULL));



CREATE INDEX "professor_academy_id_idx" ON "public"."en_escena_professor" USING "btree" ("academy_id");



CREATE UNIQUE INDEX "schedule_capacity_schedule_group_type_unique" ON "public"."en_escena_schedule_capacity" USING "btree" ("schedule_id", "group_type");



CREATE INDEX "schedule_capacity_schedule_id_idx" ON "public"."en_escena_schedule_capacity" USING "btree" ("schedule_id");



CREATE INDEX "schedule_event_id_idx" ON "public"."en_escena_schedule" USING "btree" ("event_id");



CREATE INDEX "schedule_modality_modality_id_idx" ON "public"."en_escena_schedule_modality" USING "btree" ("modality_id");



CREATE INDEX "schedule_modality_schedule_id_idx" ON "public"."en_escena_schedule_modality" USING "btree" ("schedule_id");



CREATE UNIQUE INDEX "schedule_modality_unique" ON "public"."en_escena_schedule_modality" USING "btree" ("schedule_id", "modality_id");



CREATE INDEX "submodality_event_id_idx" ON "public"."en_escena_submodality" USING "btree" ("event_id");



CREATE INDEX "submodality_modality_id_idx" ON "public"."en_escena_submodality" USING "btree" ("modality_id");



CREATE UNIQUE INDEX "submodality_modality_name_unique" ON "public"."en_escena_submodality" USING "btree" ("modality_id", "lower"("name"));



ALTER TABLE ONLY "public"."en_escena_administrative_audit_entry"
    ADD CONSTRAINT "audit_entry_admin_user_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_administrative_audit_entry"
    ADD CONSTRAINT "audit_entry_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."en_escena_category_experience_level"
    ADD CONSTRAINT "category_level_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_category_experience_level"
    ADD CONSTRAINT "category_level_level_fk" FOREIGN KEY ("experience_level_id") REFERENCES "public"."en_escena_experience_level"("id");



ALTER TABLE ONLY "public"."en_escena_category_modality"
    ADD CONSTRAINT "category_modality_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_category_modality"
    ADD CONSTRAINT "category_modality_modality_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id");



ALTER TABLE ONLY "public"."en_escena_choreography_dancer"
    ADD CONSTRAINT "choreography_dancer_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_choreography_dancer"
    ADD CONSTRAINT "choreography_dancer_dancer_fk" FOREIGN KEY ("dancer_id") REFERENCES "public"."en_escena_dancer"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "choreography_experience_level_fk" FOREIGN KEY ("experience_level_id") REFERENCES "public"."en_escena_experience_level"("id");



ALTER TABLE ONLY "public"."en_escena_choreography_professor"
    ADD CONSTRAINT "choreography_professor_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_choreography_professor"
    ADD CONSTRAINT "choreography_professor_professor_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."en_escena_professor"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "choreography_schedule_capacity_fk" FOREIGN KEY ("schedule_capacity_id") REFERENCES "public"."en_escena_schedule_capacity"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "choreography_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "choreography_submodality_fk" FOREIGN KEY ("submodality_id") REFERENCES "public"."en_escena_submodality"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_academy_id_en_esce" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_cancelled_by_user_" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_choreography_id_en" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_choreography_invoice"
    ADD CONSTRAINT "en_escena_academy_event_choreography_invoice_event_id_en_escena" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_academy_id_en_escena" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_annulled_by_user_id_" FOREIGN KEY ("annulled_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_created_by_user_id_e" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_event_id_en_escena_e" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_invoice_id_en_escena" FOREIGN KEY ("invoice_id") REFERENCES "public"."en_escena_academy_event_choreography_invoice"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_invoice_imputation"
    ADD CONSTRAINT "en_escena_academy_event_invoice_imputation_payment_id_en_escena" FOREIGN KEY ("payment_id") REFERENCES "public"."en_escena_academy_event_payment"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_payment"
    ADD CONSTRAINT "en_escena_academy_event_payment_academy_id_en_escena_academy_id" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy_event_payment"
    ADD CONSTRAINT "en_escena_academy_event_payment_annulled_by_user_id_en_escena_u" FOREIGN KEY ("annulled_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_payment"
    ADD CONSTRAINT "en_escena_academy_event_payment_created_by_user_id_en_escena_us" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."en_escena_user"("id");



ALTER TABLE ONLY "public"."en_escena_academy_event_payment"
    ADD CONSTRAINT "en_escena_academy_event_payment_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_academy"
    ADD CONSTRAINT "en_escena_academy_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_access_credential"
    ADD CONSTRAINT "en_escena_access_credential_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_access_session"
    ADD CONSTRAINT "en_escena_access_session_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_category"
    ADD CONSTRAINT "en_escena_category_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "en_escena_choreography_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "en_escena_choreography_category_id_en_escena_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "en_escena_choreography_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id");



ALTER TABLE ONLY "public"."en_escena_choreography"
    ADD CONSTRAINT "en_escena_choreography_modality_id_en_escena_modality_id_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id");



ALTER TABLE ONLY "public"."en_escena_dancer"
    ADD CONSTRAINT "en_escena_dancer_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_event_financial_sequence"
    ADD CONSTRAINT "en_escena_event_financial_sequence_event_id_en_escena_event_id_" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_experience_level"
    ADD CONSTRAINT "en_escena_experience_level_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_modality"
    ADD CONSTRAINT "en_escena_modality_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_price"
    ADD CONSTRAINT "en_escena_price_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_professor"
    ADD CONSTRAINT "en_escena_professor_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_schedule"
    ADD CONSTRAINT "en_escena_schedule_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_submodality"
    ADD CONSTRAINT "en_escena_submodality_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_submodality"
    ADD CONSTRAINT "en_escena_submodality_modality_id_en_escena_modality_id_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id");



ALTER TABLE ONLY "public"."en_escena_price"
    ADD CONSTRAINT "price_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id");



ALTER TABLE ONLY "public"."en_escena_schedule_capacity"
    ADD CONSTRAINT "schedule_capacity_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."en_escena_schedule_modality"
    ADD CONSTRAINT "schedule_modality_modality_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id");



ALTER TABLE ONLY "public"."en_escena_schedule_modality"
    ADD CONSTRAINT "schedule_modality_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE CASCADE;



ALTER TABLE "public"."en_escena_academy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_academy_event_choreography_invoice" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_academy_event_invoice_imputation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_academy_event_payment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_access_credential" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_access_session" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_administrative_audit_entry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_category" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_category_experience_level" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_category_modality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_choreography" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_choreography_dancer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_choreography_professor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_dancer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_event" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_event_financial_sequence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_experience_level" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_internal_user_invitation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_modality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_price" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_professor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_schedule_capacity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_schedule_modality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_submodality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."en_escena_user" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_academy" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_academy_event_choreography_invoice" TO "anon";
GRANT ALL ON TABLE "public"."en_escena_academy_event_choreography_invoice" TO "authenticated";
GRANT ALL ON TABLE "public"."en_escena_academy_event_choreography_invoice" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_academy_event_invoice_imputation" TO "anon";
GRANT ALL ON TABLE "public"."en_escena_academy_event_invoice_imputation" TO "authenticated";
GRANT ALL ON TABLE "public"."en_escena_academy_event_invoice_imputation" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_academy_event_payment" TO "anon";
GRANT ALL ON TABLE "public"."en_escena_academy_event_payment" TO "authenticated";
GRANT ALL ON TABLE "public"."en_escena_academy_event_payment" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_access_credential" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_access_session" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_administrative_audit_entry" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_category" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_category_experience_level" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_category_modality" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_choreography" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_choreography_dancer" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_choreography_professor" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_dancer" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_event" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_event_financial_sequence" TO "anon";
GRANT ALL ON TABLE "public"."en_escena_event_financial_sequence" TO "authenticated";
GRANT ALL ON TABLE "public"."en_escena_event_financial_sequence" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_experience_level" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_internal_user_invitation" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_modality" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_price" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_professor" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_schedule_capacity" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_schedule_modality" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_submodality" TO "service_role";



GRANT ALL ON TABLE "public"."en_escena_user" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








CREATE TYPE "public"."en_escena_administrative_audit_action" AS ENUM('create', 'update', 'archive', 'reactivate', 'reset-password', 'verify-identity');--> statement-breakpoint
CREATE TYPE "public"."en_escena_administrative_audit_entity_type" AS ENUM('professor', 'dancer', 'choreography', 'user');--> statement-breakpoint
CREATE TYPE "public"."en_escena_document_type" AS ENUM('dni', 'passport', 'other');--> statement-breakpoint
CREATE TYPE "public"."en_escena_experience_level" AS ENUM('amateur', 'profesional', 'elite', 'pre_elite', 'pro_am', 'nudo');--> statement-breakpoint
CREATE TYPE "public"."en_escena_group_type" AS ENUM('solo', 'duo', 'trio', 'grupal');--> statement-breakpoint
CREATE TYPE "public"."en_escena_user_role" AS ENUM('academy', 'admin', 'auditor', 'judge');--> statement-breakpoint
CREATE TYPE "public"."en_escena_choreography_category_calculation_mode" AS ENUM('oldest', 'group_tolerance', 'group_average');--> statement-breakpoint
CREATE TYPE "public"."en_escena_payment_allocation_type" AS ENUM('deposit', 'balance');--> statement-breakpoint
CREATE TYPE "public"."en_escena_finance_payment_method" AS ENUM('transferencia', 'efectivo', 'mercado_pago', 'otro');--> statement-breakpoint
CREATE TABLE "en_escena_access_credential" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_access_credential" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_access_session" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(255) NOT NULL,
	CONSTRAINT "en_escena_access_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "en_escena_access_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_internal_user_invitation" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "en_escena_user_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_internal_user_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_user" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "en_escena_user_role" DEFAULT 'academy' NOT NULL,
	"internal_username" text,
	"requires_password_change" boolean DEFAULT false NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"session_invalid_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "en_escena_user_email_unique" UNIQUE("email"),
	CONSTRAINT "en_escena_user_internal_username_unique" UNIQUE("internal_username")
);
--> statement-breakpoint
ALTER TABLE "en_escena_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_academy" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_academy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_dancer" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"document_type" "en_escena_document_type",
	"document_number" text,
	"document_front_image_storage_key" text,
	"document_back_image_storage_key" text,
	"identity_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_dancer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_professor" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"document_type" "en_escena_document_type",
	"document_number" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_professor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_category" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"min_age" integer NOT NULL,
	"max_age" integer NOT NULL,
	"group_types" "en_escena_group_type"[] NOT NULL,
	"group_type_key" text NOT NULL,
	"experience_levels" "en_escena_experience_level"[] DEFAULT ARRAY[]::en_escena_experience_level[] NOT NULL,
	"experience_level_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_category_modality" (
	"category_id" varchar(255) NOT NULL,
	"modality_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_category_modality" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_event" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"program_visible" boolean DEFAULT false NOT NULL,
	"results_visible" boolean DEFAULT false NOT NULL,
	"required_deposit_percentage" integer DEFAULT 30 NOT NULL,
	"registration_starts_at" timestamp with time zone NOT NULL,
	"registration_ends_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"registration_ready" boolean DEFAULT false NOT NULL,
	"registration_readiness_missing_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"registration_readiness_dirty" boolean DEFAULT true NOT NULL,
	"registration_readiness_calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_modality" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_modality" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_price" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"schedule_id" varchar(255),
	"group_type" "en_escena_group_type" NOT NULL,
	"payment_deadline" text,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_price" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_schedule_capacity" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"schedule_id" varchar(255) NOT NULL,
	"group_type" "en_escena_group_type" NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_schedule_capacity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_schedule_modality" (
	"schedule_id" varchar(255) NOT NULL,
	"modality_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_schedule_modality" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_schedule" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"scheduled_date" text NOT NULL,
	"start_time" text NOT NULL,
	"total_capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_submodality" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"modality_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_submodality" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_choreography" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"modality_id" varchar(255) NOT NULL,
	"submodality_id" varchar(255),
	"group_type" "en_escena_group_type" NOT NULL,
	"category_id" varchar(255),
	"category_age_basis" integer,
	"category_calculation_mode" "en_escena_choreography_category_calculation_mode" NOT NULL,
	"experience_level" "en_escena_experience_level",
	"schedule_id" varchar(255),
	"schedule_capacity_id" varchar(255),
	"music_storage_key" text,
	"has_presentation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_choreography_dancer" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"choreography_id" varchar(255) NOT NULL,
	"dancer_id" varchar(255) NOT NULL,
	"age_at_event_start" integer NOT NULL,
	"frozen_base_price_amount" integer,
	"selected_price_id" varchar(255),
	"deposit_reference_date" text,
	"deposit_percentage" integer,
	"deposit_amount" integer,
	"balance_reference_date" text,
	"applied_dancer_discount_percentage" integer,
	"applied_dancer_discount_amount" integer,
	"final_total_amount" integer,
	"balance_amount" integer,
	"balance_completed_at" text
);
--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_choreography_professor" (
	"choreography_id" varchar(255) NOT NULL,
	"professor_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_choreography_professor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_administrative_audit_entry" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"entity_type" "en_escena_administrative_audit_entity_type" NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"event_id" varchar(255),
	"admin_user_id" varchar(255) NOT NULL,
	"action" "en_escena_administrative_audit_action" NOT NULL,
	"reason" text,
	"before_values" jsonb NOT NULL,
	"after_values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_administrative_audit_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_event_financial_sequence" (
	"event_id" varchar(255) PRIMARY KEY NOT NULL,
	"next_payment_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_event_financial_sequence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_payment_allocation" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"payment_id" varchar(255) NOT NULL,
	"inscription_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"allocation_type" "en_escena_payment_allocation_type" NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "en_escena_payment" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"academy_id" varchar(255) NOT NULL,
	"payment_number" integer NOT NULL,
	"payment_date" text NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" "en_escena_finance_payment_method" NOT NULL,
	"reference" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_access_credential" ADD CONSTRAINT "en_escena_access_credential_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_access_session" ADD CONSTRAINT "en_escena_access_session_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_academy" ADD CONSTRAINT "en_escena_academy_user_id_en_escena_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_dancer" ADD CONSTRAINT "en_escena_dancer_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_professor" ADD CONSTRAINT "en_escena_professor_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_category" ADD CONSTRAINT "en_escena_category_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_category_modality" ADD CONSTRAINT "category_modality_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_category_modality" ADD CONSTRAINT "category_modality_modality_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_modality" ADD CONSTRAINT "en_escena_modality_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_price" ADD CONSTRAINT "en_escena_price_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_price" ADD CONSTRAINT "price_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_schedule_capacity" ADD CONSTRAINT "schedule_capacity_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_schedule_modality" ADD CONSTRAINT "schedule_modality_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_schedule_modality" ADD CONSTRAINT "schedule_modality_modality_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_schedule" ADD CONSTRAINT "en_escena_schedule_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_submodality" ADD CONSTRAINT "en_escena_submodality_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_submodality" ADD CONSTRAINT "en_escena_submodality_modality_id_en_escena_modality_id_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "en_escena_choreography_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "en_escena_choreography_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "en_escena_choreography_modality_id_en_escena_modality_id_fk" FOREIGN KEY ("modality_id") REFERENCES "public"."en_escena_modality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "en_escena_choreography_category_id_en_escena_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."en_escena_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "choreography_submodality_fk" FOREIGN KEY ("submodality_id") REFERENCES "public"."en_escena_submodality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "choreography_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."en_escena_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "choreography_schedule_capacity_fk" FOREIGN KEY ("schedule_capacity_id") REFERENCES "public"."en_escena_schedule_capacity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" ADD CONSTRAINT "choreography_dancer_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" ADD CONSTRAINT "choreography_dancer_dancer_fk" FOREIGN KEY ("dancer_id") REFERENCES "public"."en_escena_dancer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_dancer" ADD CONSTRAINT "choreography_dancer_selected_price_fk" FOREIGN KEY ("selected_price_id") REFERENCES "public"."en_escena_price"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_professor" ADD CONSTRAINT "choreography_professor_choreography_fk" FOREIGN KEY ("choreography_id") REFERENCES "public"."en_escena_choreography"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_choreography_professor" ADD CONSTRAINT "choreography_professor_professor_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."en_escena_professor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_administrative_audit_entry" ADD CONSTRAINT "audit_entry_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_administrative_audit_entry" ADD CONSTRAINT "audit_entry_admin_user_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."en_escena_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_event_financial_sequence" ADD CONSTRAINT "en_escena_event_financial_sequence_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."en_escena_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_inscription_fk" FOREIGN KEY ("inscription_id") REFERENCES "public"."en_escena_choreography_dancer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_academy_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment_allocation" ADD CONSTRAINT "payment_allocation_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment" ADD CONSTRAINT "en_escena_payment_event_id_en_escena_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "en_escena_payment" ADD CONSTRAINT "en_escena_payment_academy_id_en_escena_academy_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."en_escena_academy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_credential_user_id_unique" ON "en_escena_access_credential" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_session_user_id_idx" ON "en_escena_access_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_user_invitation_token_hash_unique" ON "en_escena_internal_user_invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "internal_user_invitation_email_idx" ON "en_escena_internal_user_invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_user_id_unique" ON "en_escena_academy" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dancer_academy_id_idx" ON "en_escena_dancer" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "dancer_academy_name_idx" ON "en_escena_dancer" USING btree ("academy_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "dancer_academy_document_unique" ON "en_escena_dancer" USING btree ("academy_id","document_type","document_number") WHERE "en_escena_dancer"."document_type" is not null and "en_escena_dancer"."document_number" is not null;--> statement-breakpoint
CREATE INDEX "professor_academy_id_idx" ON "en_escena_professor" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "professor_academy_document_unique" ON "en_escena_professor" USING btree ("academy_id","document_type","document_number") WHERE "en_escena_professor"."document_type" is not null and "en_escena_professor"."document_number" is not null;--> statement-breakpoint
CREATE INDEX "category_event_id_idx" ON "en_escena_category" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "category_event_age_range_idx" ON "en_escena_category" USING btree ("event_id","min_age","max_age");--> statement-breakpoint
CREATE UNIQUE INDEX "category_modality_unique" ON "en_escena_category_modality" USING btree ("category_id","modality_id");--> statement-breakpoint
CREATE INDEX "category_modality_modality_id_idx" ON "en_escena_category_modality" USING btree ("modality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_single_active_unique" ON "en_escena_event" USING btree ("active") WHERE "en_escena_event"."active" = true;--> statement-breakpoint
CREATE INDEX "modality_event_id_idx" ON "en_escena_modality" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modality_event_name_unique" ON "en_escena_modality" USING btree ("event_id","name");--> statement-breakpoint
CREATE INDEX "price_event_id_idx" ON "en_escena_price" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "price_schedule_id_idx" ON "en_escena_price" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_general_unique" ON "en_escena_price" USING btree ("event_id","group_type","payment_deadline") WHERE "en_escena_price"."schedule_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "price_specific_unique" ON "en_escena_price" USING btree ("event_id","group_type","schedule_id","payment_deadline") WHERE "en_escena_price"."schedule_id" is not null;--> statement-breakpoint
CREATE INDEX "schedule_capacity_schedule_id_idx" ON "en_escena_schedule_capacity" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_capacity_schedule_group_type_unique" ON "en_escena_schedule_capacity" USING btree ("schedule_id","group_type");--> statement-breakpoint
CREATE INDEX "schedule_modality_schedule_id_idx" ON "en_escena_schedule_modality" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_modality_modality_id_idx" ON "en_escena_schedule_modality" USING btree ("modality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_modality_unique" ON "en_escena_schedule_modality" USING btree ("schedule_id","modality_id");--> statement-breakpoint
CREATE INDEX "schedule_event_id_idx" ON "en_escena_schedule" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "submodality_event_id_idx" ON "en_escena_submodality" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "submodality_modality_id_idx" ON "en_escena_submodality" USING btree ("modality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submodality_modality_name_unique" ON "en_escena_submodality" USING btree ("modality_id",lower("name"));--> statement-breakpoint
CREATE INDEX "choreography_event_academy_created_idx" ON "en_escena_choreography" USING btree ("event_id","academy_id","created_at");--> statement-breakpoint
CREATE INDEX "choreography_schedule_id_idx" ON "en_escena_choreography" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "choreography_schedule_capacity_id_idx" ON "en_escena_choreography" USING btree ("schedule_capacity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "choreography_dancer_unique" ON "en_escena_choreography_dancer" USING btree ("choreography_id","dancer_id");--> statement-breakpoint
CREATE INDEX "choreography_dancer_dancer_id_idx" ON "en_escena_choreography_dancer" USING btree ("dancer_id");--> statement-breakpoint
CREATE INDEX "choreography_dancer_selected_price_idx" ON "en_escena_choreography_dancer" USING btree ("selected_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "choreography_professor_unique" ON "en_escena_choreography_professor" USING btree ("choreography_id","professor_id");--> statement-breakpoint
CREATE INDEX "choreography_professor_professor_id_idx" ON "en_escena_choreography_professor" USING btree ("professor_id");--> statement-breakpoint
CREATE INDEX "administrative_audit_entry_entity_idx" ON "en_escena_administrative_audit_entry" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "administrative_audit_entry_event_idx" ON "en_escena_administrative_audit_entry" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "administrative_audit_entry_admin_user_idx" ON "en_escena_administrative_audit_entry" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "event_financial_sequence_updated_idx" ON "en_escena_event_financial_sequence" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocation_payment_inscription_type_unique" ON "en_escena_payment_allocation" USING btree ("payment_id","inscription_id","allocation_type");--> statement-breakpoint
CREATE INDEX "payment_allocation_inscription_idx" ON "en_escena_payment_allocation" USING btree ("inscription_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_allocation_payment_idx" ON "en_escena_payment_allocation" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_allocation_event_academy_idx" ON "en_escena_payment_allocation" USING btree ("event_id","academy_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_number_unique" ON "en_escena_payment" USING btree ("event_id","payment_number");--> statement-breakpoint
CREATE INDEX "payment_event_academy_idx" ON "en_escena_payment" USING btree ("event_id","academy_id","created_at");
-- Sin auditoría de actor: registrar un pago ya no requiere `created_by_user_id`.
ALTER TABLE "public"."en_escena_academy_event_payment"
ALTER COLUMN "created_by_user_id" DROP NOT NULL;

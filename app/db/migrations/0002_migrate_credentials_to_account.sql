-- Migrar las credenciales locales de `access_credential` a la tabla `account`
-- de Better Auth: provider_id = 'credential', account_id = user_id y el hash
-- pasa a `password`. Se conservan id, created_at y updated_at de cada fila.
INSERT INTO "en_escena_account" (
	"id",
	"account_id",
	"provider_id",
	"user_id",
	"password",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	"user_id",
	'credential',
	"user_id",
	"password_hash",
	"created_at",
	"updated_at"
FROM "en_escena_access_credential";
--> statement-breakpoint
DROP TABLE "en_escena_access_credential" CASCADE;
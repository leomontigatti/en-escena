DROP INDEX "seminar_inscription_seminar_dancer_unique";--> statement-breakpoint
DROP INDEX "seminar_inscription_seminar_professor_unique";--> statement-breakpoint
DROP INDEX "choreography_dancer_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "seminar_inscription_seminar_dancer_unique" ON "en_escena_seminar_inscription" USING btree ("seminar_id","dancer_id") WHERE "en_escena_seminar_inscription"."dancer_id" is not null and "en_escena_seminar_inscription"."withdrawn_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "seminar_inscription_seminar_professor_unique" ON "en_escena_seminar_inscription" USING btree ("seminar_id","professor_id") WHERE "en_escena_seminar_inscription"."professor_id" is not null and "en_escena_seminar_inscription"."withdrawn_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "choreography_dancer_unique" ON "en_escena_choreography_dancer" USING btree ("choreography_id","dancer_id") WHERE "en_escena_choreography_dancer"."withdrawn_at" is null;
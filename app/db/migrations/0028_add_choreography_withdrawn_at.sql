-- Soft withdrawal of a whole choreography. Nullable: the choreography is
-- withdrawn if and only if it is set, and the value is shared with the
-- inscriptions the withdrawal took so that restoring revives exactly those.
ALTER TABLE "en_escena_choreography" ADD COLUMN "withdrawn_at" timestamp with time zone;

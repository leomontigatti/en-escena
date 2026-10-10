-- When administration published a round's Gran final result; null while it is
-- not public. Hiding the result clears it.
ALTER TABLE "en_escena_voting_round" ADD COLUMN "published_at" timestamp with time zone;
-- The inscription gains a registration date of its own. Until now the closest
-- date available was `en_escena_choreography."created_at"`, and counting
-- inscriptions by it credits the choreography's own creation with every dancer
-- added to the roster afterwards: a choreography created on the 20th and
-- completed on the 31st counts all ten of its inscriptions on the 20th.
--
-- `DEFAULT CURRENT_TIMESTAMP NOT NULL` leaves the existing rows at the moment
-- of the migration, which is wrong for every one of them, so the `UPDATE` puts
-- them back at their choreography's date. That date is exactly the
-- approximation this column exists to replace: correct for the choreography
-- registered whole — the normal path, and most of the rows — and early for a
-- roster edited later. There is nothing better to backfill from; the real date
-- of those later additions was never recorded anywhere. From here the column
-- writes itself and the figure is exact.
--
-- Deliberately unindexed: no read groups by this column yet, and the active
-- event holds hundreds of inscriptions, not millions.
ALTER TABLE "en_escena_choreography_dancer" ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
UPDATE "en_escena_choreography_dancer" AS cd
SET "created_at" = c."created_at"
FROM "en_escena_choreography" AS c
WHERE c."id" = cd."choreography_id";

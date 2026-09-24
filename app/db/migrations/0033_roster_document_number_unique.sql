-- The document number alone is the key within an academy, for dancers and for
-- professors separately (PRD #1090): the same number loaded as `dni` and as
-- `otro` was two rows under the old `(academy_id, document_type,
-- document_number)` index.
--
-- The guard runs before the indexes exist, so a pair created between the
-- 2026-09-20 audit and this deploy fails the migration loudly instead of being
-- silently kept. Production had no such pair when this was written.
DO $$
DECLARE
  offending_count integer;
BEGIN
  SELECT count(*) INTO offending_count FROM (
    SELECT 1 FROM "en_escena_dancer"
    WHERE "document_number" is not null
    GROUP BY "academy_id", "document_number"
    HAVING count(*) > 1
  ) AS duplicates;

  IF offending_count > 0 THEN
    RAISE EXCEPTION
      'Cannot key dancers on the document number: % (academy_id, document_number) group(s) hold more than one dancer. Merge them before migrating.',
      offending_count;
  END IF;

  SELECT count(*) INTO offending_count FROM (
    SELECT 1 FROM "en_escena_professor"
    WHERE "document_number" is not null
    GROUP BY "academy_id", "document_number"
    HAVING count(*) > 1
  ) AS duplicates;

  IF offending_count > 0 THEN
    RAISE EXCEPTION
      'Cannot key professors on the document number: % (academy_id, document_number) group(s) hold more than one professor. Merge them before migrating.',
      offending_count;
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "dancer_academy_document_unique";--> statement-breakpoint
DROP INDEX "professor_academy_document_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "dancer_academy_document_number_unique" ON "en_escena_dancer" USING btree ("academy_id","document_number") WHERE "en_escena_dancer"."document_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "professor_academy_document_number_unique" ON "en_escena_professor" USING btree ("academy_id","document_number") WHERE "en_escena_professor"."document_number" is not null;

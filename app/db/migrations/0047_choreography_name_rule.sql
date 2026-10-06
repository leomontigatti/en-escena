-- One rule for the choreography's name (#764). The administrative write paths
-- stored whatever was typed, so existing names are brought to the stored form
-- `normalizeChoreographyName` gives every name written from now on: trimmed,
-- whitespace runs collapsed, Spanish title case with lowercase particles after
-- the first word and a capital after each hyphen. Only "name" is written.
--
-- `pg_c_utf8` makes the case mapping the same on every database, whatever
-- locale it was created with. A name without a letter or digit is left as it
-- is: there is nothing to normalize it to, and an administrator renames it.
UPDATE "en_escena_choreography" AS target
SET "name" = normalized."name"
FROM (
  SELECT
    collapsed."id",
    (
      SELECT string_agg(
        CASE
          WHEN word.position > 1
            AND word.value IN ('a', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'y')
            THEN word.value
          ELSE (
            SELECT string_agg(
              upper(left(part.value, 1) COLLATE "pg_c_utf8") || substr(part.value, 2),
              '-' ORDER BY part.position
            )
            FROM unnest(string_to_array(word.value, '-')) WITH ORDINALITY AS part(value, position)
          )
        END,
        ' ' ORDER BY word.position
      )
      FROM unnest(string_to_array(collapsed."name", ' ')) WITH ORDINALITY AS word(value, position)
    ) AS "name"
  FROM (
    SELECT
      "id",
      lower(btrim(regexp_replace("name", '[\s ]+', ' ', 'g')) COLLATE "pg_c_utf8") AS "name"
    FROM "en_escena_choreography"
    WHERE ("name" COLLATE "pg_c_utf8") ~ '[[:alnum:]]'
  ) AS collapsed
) AS normalized
WHERE target."id" = normalized."id"
  AND target."name" <> normalized."name";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "choreography_name_length" CHECK (char_length(btrim("en_escena_choreography"."name")) between 1 and 120) NOT VALID;--> statement-breakpoint
-- The names the rule refuses and the backfill could not fix are reported, not
-- rewritten: `scripts/migrate.mjs` prints each warning in the deploy log. The
-- CHECK already holds for every write; it is validated here unless a stored
-- name is outside it, so one such name does not stop the deploy.
DO $$
DECLARE
  offending record;
  outside_check boolean := false;
BEGIN
  FOR offending IN
    SELECT
      "id",
      char_length(btrim("name")) NOT BETWEEN 1 AND 120 AS "outside_check"
    FROM "en_escena_choreography"
    WHERE NOT ("name" COLLATE "pg_c_utf8") ~ '[[:alnum:]]'
      OR char_length(btrim("name")) NOT BETWEEN 1 AND 120
    ORDER BY "id"
  LOOP
    outside_check := outside_check OR offending."outside_check";
    RAISE WARNING 'Choreography % keeps a name the name rule refuses (%). Rename it from the administration panel.',
      offending."id",
      CASE WHEN offending."outside_check" THEN 'empty or over 120 characters' ELSE 'no letter or digit' END;
  END LOOP;

  IF outside_check THEN
    RAISE WARNING 'choreography_name_length is left NOT VALID. Once those names are renamed: ALTER TABLE "en_escena_choreography" VALIDATE CONSTRAINT "choreography_name_length";';
  ELSE
    ALTER TABLE "en_escena_choreography" VALIDATE CONSTRAINT "choreography_name_length";
  END IF;
END $$;

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
      lower(btrim(regexp_replace("name", '[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+', ' ', 'g')) COLLATE "pg_c_utf8") AS "name"
    FROM "en_escena_choreography"
    WHERE ("name" COLLATE "pg_c_utf8") ~ '[[:alnum:]]'
  ) AS collapsed
) AS normalized
WHERE target."id" = normalized."id"
  AND target."name" <> normalized."name";--> statement-breakpoint
ALTER TABLE "en_escena_choreography" ADD CONSTRAINT "choreography_name_length" CHECK (char_length(btrim("en_escena_choreography"."name")) between 1 and 120);--> statement-breakpoint
-- The names the rule refuses and the backfill could not fix are reported, not
-- rewritten: `scripts/migrate.mjs` prints each warning in the deploy log. They
-- hold the CHECK above, which a name that is empty or over the ceiling does
-- not: that one stops the migration until it is renamed. Production has none.
DO $$
DECLARE
  offending record;
BEGIN
  FOR offending IN
    SELECT "id"
    FROM "en_escena_choreography"
    WHERE NOT ("name" COLLATE "pg_c_utf8") ~ '[[:alnum:]]'
    ORDER BY "id"
  LOOP
    RAISE WARNING 'Choreography % keeps a name without a letter or digit, which the name rule refuses. Rename it from the administration panel.',
      offending."id";
  END LOOP;
END $$;

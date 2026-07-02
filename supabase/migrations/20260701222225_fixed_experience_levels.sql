CREATE OR REPLACE FUNCTION public.en_escena_map_experience_level_name(level_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE trim(both '_' from regexp_replace(lower(trim(level_name)), '[^a-z0-9]+', '_', 'g'))
    WHEN 'amateur' THEN 'amateur'
    WHEN 'inicial' THEN 'amateur'
    WHEN 'principiante' THEN 'amateur'
    WHEN 'profesional' THEN 'profesional'
    WHEN 'elite' THEN 'elite'
    WHEN 'pre_elite' THEN 'pre_elite'
    WHEN 'pro_am' THEN 'pro_am'
    WHEN 'nudo' THEN 'nudo'
    ELSE NULL
  END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.en_escena_experience_level
    WHERE public.en_escena_map_experience_level_name(name) IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate unknown experience level names to fixed enum values.';
  END IF;
END
$$;

ALTER TABLE public.en_escena_category
  ADD COLUMN experience_levels_text text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.en_escena_category AS category
SET
  experience_levels_text = category_levels.experience_levels,
  experience_level_key = array_to_string(category_levels.experience_levels, '|')
FROM (
  SELECT
    category_level.category_id,
    array_agg(
      public.en_escena_map_experience_level_name(level.name)
      ORDER BY public.en_escena_map_experience_level_name(level.name)
    ) AS experience_levels
  FROM public.en_escena_category_experience_level AS category_level
  INNER JOIN public.en_escena_experience_level AS level
    ON level.id = category_level.experience_level_id
  GROUP BY category_level.category_id
) AS category_levels
WHERE category.id = category_levels.category_id;

ALTER TABLE public.en_escena_choreography
  ADD COLUMN experience_level_text text;

UPDATE public.en_escena_choreography AS choreography
SET experience_level_text = public.en_escena_map_experience_level_name(level.name)
FROM public.en_escena_experience_level AS level
WHERE choreography.experience_level_id = level.id;

ALTER TABLE public.en_escena_choreography
  DROP CONSTRAINT IF EXISTS choreography_experience_level_fk;

DROP TABLE public.en_escena_category_experience_level;
DROP TABLE public.en_escena_experience_level;

CREATE TYPE public.en_escena_experience_level AS ENUM (
  'amateur',
  'profesional',
  'elite',
  'pre_elite',
  'pro_am',
  'nudo'
);

ALTER TABLE public.en_escena_category
  ADD COLUMN experience_levels public.en_escena_experience_level[]
  NOT NULL
  DEFAULT ARRAY[]::public.en_escena_experience_level[];

UPDATE public.en_escena_category
SET experience_levels = experience_levels_text::public.en_escena_experience_level[];

ALTER TABLE public.en_escena_category
  DROP COLUMN experience_levels_text;

ALTER TABLE public.en_escena_choreography
  ADD COLUMN experience_level public.en_escena_experience_level;

UPDATE public.en_escena_choreography
SET experience_level = experience_level_text::public.en_escena_experience_level;

ALTER TABLE public.en_escena_choreography
  DROP COLUMN experience_level_id,
  DROP COLUMN experience_level_text;

DROP FUNCTION public.en_escena_map_experience_level_name(text);

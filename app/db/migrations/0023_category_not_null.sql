-- A choreography always has a category. Every write that could resolve one to
-- no category is refused on the server (PRD #996), so the column stops being
-- nullable and the "sin categoría" state disappears from the app.
--
-- The statement fails if any row still has a null category; production was
-- counted before this landed and had none.
ALTER TABLE "en_escena_choreography" ALTER COLUMN "category_id" SET NOT NULL;
-- Results visibility stopped being a boolean: publishing is a snapshot, so the
-- event carries `results_published_at` (migration 0031) and each presentation
-- its own stamp. See docs/domain/judging.md, "Program And Results".
-- reason: nothing ever read this column — the toggle that wrote it was dead
-- (#1112), no surface branched on it, and every row kept its `false` default.
-- There is nothing to expand into and no data to move, so the drop ships on its
-- own; the old container's selects of it fail for the length of the deploy, and
-- what they would have read is a constant nobody used.
-- squawk-ignore ban-drop-column
ALTER TABLE "en_escena_event" DROP COLUMN "results_visible";

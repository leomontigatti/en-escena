-- Makes the deadline-less base price unique per tier. Hand-written because
-- Drizzle cannot express `NULLS NOT DISTINCT` on an index — only on a
-- `unique()` constraint, which neither of these can be, since both are partial
-- (they split on `schedule_id`). The TypeScript schema therefore carries the
-- index without the clause, and the snapshot is identical to the previous one.
--
-- Postgres treats NULLs as distinct by default, so without this a second row
-- with a null `payment_deadline` for the same `(event, group type[, schedule])`
-- passes the index. Two base prices would then both survive the date filter in
-- `selectApplicablePriceFromCandidates`, and `compareApplicablePrices` would
-- fall through to `first.amount - second.amount` — the cheaper one winning by a
-- rule nobody authored.
--
-- Safe on existing data: every price row in production carries a deadline, so
-- the recreated indexes see no null to collide.
DROP INDEX "price_general_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "price_general_unique" ON "en_escena_price" USING btree ("event_id","group_type","payment_deadline") NULLS NOT DISTINCT WHERE "en_escena_price"."schedule_id" is null;--> statement-breakpoint
DROP INDEX "price_specific_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "price_specific_unique" ON "en_escena_price" USING btree ("event_id","group_type","schedule_id","payment_deadline") NULLS NOT DISTINCT WHERE "en_escena_price"."schedule_id" is not null;

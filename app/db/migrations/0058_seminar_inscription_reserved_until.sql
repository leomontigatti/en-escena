ALTER TABLE "en_escena_seminar_inscription" ADD COLUMN "reserved_until" timestamp with time zone;--> statement-breakpoint
-- Backfill: an active inscription registered in the last 72 hours that has not
-- covered its deposit reserves a place, oldest registration first, in the
-- places its seminar's covered inscriptions leave free, never past the
-- seminar's start (business time, UTC-3). Covered means the allocations reach
-- the deposit of the stored price row at the seminar's rate, and are not zero.
WITH "inscription_money" AS (
  SELECT
    "si"."id",
    "si"."seminar_id",
    "si"."created_at",
    coalesce((
      SELECT sum("pa"."amount")
      FROM "en_escena_payment_allocation" "pa"
      WHERE "pa"."seminar_inscription_id" = "si"."id"
    ), 0) AS "allocated",
    round("sp"."amount" * "s"."required_deposit_percentage" / 100.0) AS "deposit"
  FROM "en_escena_seminar_inscription" "si"
  JOIN "en_escena_seminar" "s" ON "s"."id" = "si"."seminar_id"
  LEFT JOIN "en_escena_seminar_price" "sp" ON "sp"."id" = "si"."selected_price_id"
  WHERE "si"."withdrawn_at" IS NULL
), "classified" AS (
  SELECT
    "inscription_money".*,
    ("deposit" IS NOT NULL AND "allocated" > 0 AND "allocated" >= "deposit") AS "covered"
  FROM "inscription_money"
), "covered_counts" AS (
  SELECT "seminar_id", count(*) FILTER (WHERE "covered") AS "covered_count"
  FROM "classified"
  GROUP BY "seminar_id"
), "candidates" AS (
  SELECT
    "id",
    "seminar_id",
    "created_at",
    row_number() OVER (
      PARTITION BY "seminar_id" ORDER BY "created_at", "id"
    ) AS "position"
  FROM "classified"
  WHERE NOT "covered" AND "created_at" > now() - interval '72 hours'
)
UPDATE "en_escena_seminar_inscription" "target"
SET "reserved_until" = least(
  "candidates"."created_at" + interval '72 hours',
  ("s"."scheduled_date" || 'T' || "s"."start_time" || ':00-03:00')::timestamptz
)
FROM "candidates"
JOIN "en_escena_seminar" "s" ON "s"."id" = "candidates"."seminar_id"
JOIN "covered_counts" ON "covered_counts"."seminar_id" = "candidates"."seminar_id"
WHERE "target"."id" = "candidates"."id"
  AND "candidates"."position" <= "s"."quota" - "covered_counts"."covered_count"
  AND ("s"."scheduled_date" || 'T' || "s"."start_time" || ':00-03:00')::timestamptz > now();

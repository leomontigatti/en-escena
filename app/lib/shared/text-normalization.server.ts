import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { normalizeForComparison } from "@/lib/shared/text-normalization";

/**
 * The SQL twin of `normalizeForComparison`: the stored value case-folded and
 * whitespace-collapsed, so a name typed with a stray space or in another case
 * still matches the row already loaded. Accent-sensitive — no folding extension
 * is installed (PRD #1090).
 *
 * The escape has to survive the template literal before it reaches Postgres:
 * `'\s+'` written here would cook to `'s+'` and collapse runs of the letter `s`
 * instead of whitespace.
 */
export function normalizedTextEquals(column: PgColumn, value: string): SQL {
  return sql`lower(regexp_replace(btrim(${column}), '\\s+', ' ', 'g')) = ${normalizeForComparison(value)}`;
}

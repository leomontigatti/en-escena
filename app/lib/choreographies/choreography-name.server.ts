import { asc, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { foldedText } from "@/lib/list-query/list-query.server";

/**
 * The order of a list by `choreographyName`, to spread into `orderBy`: accent-
 * and case-insensitive, so `Ángeles` sits with the A's, with the stored name
 * breaking the tie between two names that fold to the same text. Every read
 * ordered by name uses it, so two screens agree on the order of the same pair.
 */
export function orderByChoreographyName(column: PgColumn): SQL[] {
  return [asc(foldedText(column)), asc(column)];
}

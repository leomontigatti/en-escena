import { isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { choreographies } from "@/db/schema";

/**
 * A withdrawn choreography stays in the table —it keeps the money its
 * inscriptions hold, its number and the schedule references a restore needs— so
 * every read that asks about what is taking part filters it out. This predicate
 * is the only place that filter lives: nobody writes
 * `isNull(choreographies.withdrawnAt)` by hand, exactly as with
 * `activeInscription()` for the roster.
 */
export function notWithdrawnChoreography(): SQL {
  return isNull(choreographies.withdrawnAt);
}

/**
 * The complement, for the writes that must reach withdrawn choreographies and
 * only them: releasing the capacity references of the rows left pointing at a
 * capacity about to be deleted is the one such write. Narrowing it matters —
 * touching a choreography that is taking part would strip a live assignment.
 */
export function withdrawnChoreography(): SQL {
  return isNotNull(choreographies.withdrawnAt);
}

/**
 * The raw-SQL twin, for the queries that build their `exists` by hand and give
 * `choreography` an alias of their own (the participation predicates do). Same
 * condition as `notWithdrawnChoreography()`, mirroring the pair
 * `activeInscription()` / `activeInscriptionSql()`.
 */
export function notWithdrawnChoreographySql(
  choreographyTableAlias: string,
): SQL {
  return sql`${sql.identifier(choreographyTableAlias)}.${sql.identifier("withdrawn_at")} is null`;
}

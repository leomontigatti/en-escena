import { isNull, type SQL } from "drizzle-orm";

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

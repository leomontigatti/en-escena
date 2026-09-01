import { isNull, sql, type SQL } from "drizzle-orm";

import { choreographyDancers } from "@/db/schema";

/**
 * A withdrawn inscription stays in the table —it keeps the allocated money and
 * the comprobante line that justify it— so every read filters it out unless it
 * shows evidence on purpose. This predicate is the only place that filter
 * lives: nobody writes `isNull(choreographyDancers.withdrawnAt)` by hand.
 */
export function activeInscription(): SQL {
  return isNull(choreographyDancers.withdrawnAt);
}

/**
 * The raw-SQL twin, for the queries that do not go through the query builder (a
 * hand-built `exists`, for instance). It takes the alias the query gave
 * `choreography_dancer`, because in a correlated `exists` the table is almost
 * never named as it is in the schema. It is the same condition as
 * `activeInscription()`, and a test compares it against that one over a fixture
 * with withdrawn rows: if either moves, the other fails.
 */
export function activeInscriptionSql(inscriptionTableAlias: string): SQL {
  return sql`${sql.identifier(inscriptionTableAlias)}.${sql.identifier("withdrawn_at")} is null`;
}

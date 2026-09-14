import { isNull, sql, type SQL } from "drizzle-orm";

import { seminarInscriptions } from "@/db/schema";

/**
 * The seminar twin of `activeInscription()`, and deliberately a **second
 * predicate rather than a generic one over two tables**: a predicate that took
 * a table would have to be told which one on every call, which is the same
 * knowledge with an extra argument.
 *
 * A withdrawn seminar inscription stays in the table — it keeps the money
 * allocated to it and the comprobante line that justifies it — so every roster
 * read and the covered count filter it out. What the rule buys on this side is
 * the place: a withdrawn row holds none, so withdrawal frees it.
 */
export function activeSeminarInscription(): SQL {
  return isNull(seminarInscriptions.withdrawnAt);
}

/**
 * The raw-SQL twin, for the queries that do not go through the query builder —
 * a hand-built `exists` or a lock-scoped count. It takes the alias the query
 * gave `seminar_inscription`, because in a correlated subquery the table is
 * almost never named as it is in the schema. A test compares it against
 * `activeSeminarInscription()` over a fixture with withdrawn rows: if either
 * moves, the other fails.
 */
export function activeSeminarInscriptionSql(
  inscriptionTableAlias: string,
): SQL {
  return sql`${sql.identifier(inscriptionTableAlias)}.${sql.identifier("withdrawn_at")} is null`;
}

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
 * El gemelo en SQL crudo, para las consultas que no pasan por el query builder
 * (un `exists` armado a mano, por ejemplo). Toma el alias con el que la consulta
 * nombró a `choreography_dancer`, porque en un `exists` correlacionado la tabla
 * casi nunca se llama como en el schema. Es la misma condición que
 * `activeInscription()`, y un test la compara contra ella sobre una fixture con
 * filas retiradas: si una de las dos se mueve, la otra falla.
 */
export function activeInscriptionSql(inscriptionTableAlias: string): SQL {
  return sql`${sql.identifier(inscriptionTableAlias)}.${sql.identifier("withdrawn_at")} is null`;
}

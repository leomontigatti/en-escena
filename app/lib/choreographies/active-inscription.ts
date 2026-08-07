import { isNull, sql, type SQL } from "drizzle-orm";

import { choreographyDancers } from "@/db/schema";

/**
 * Una inscripción retirada sigue en la tabla —conserva la plata asignada y la
 * línea de comprobante que la justifican— así que toda lectura la filtra salvo
 * que muestre evidencia a propósito. Este predicado es el único lugar donde vive
 * ese filtro: nadie escribe `isNull(choreographyDancers.withdrawnAt)` a mano.
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

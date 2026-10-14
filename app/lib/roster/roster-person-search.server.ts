import { or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { listSearchCondition } from "@/lib/list-query/list-query.server";
import { toDocumentNumberSearchTerm } from "@/lib/roster/identity-document";

/**
 * The SQL twin of `matchesRosterPersonSearch`, over a dancer or professor
 * table, plus whatever else the list is searched by (its academy's name).
 */
export function rosterPersonSearchCondition(
  search: string,
  person: {
    firstName: PgColumn;
    lastName: PgColumn;
    documentNumber: PgColumn;
  },
  otherColumns: readonly SQLWrapper[] = [],
): SQL | undefined {
  const searchCondition = listSearchCondition(search, [
    person.firstName,
    person.lastName,
    sql`${person.firstName} || ' ' || ${person.lastName}`,
    sql`${person.lastName} || ' ' || ${person.firstName}`,
    person.documentNumber,
    ...otherColumns,
  ]);
  const documentSearch = toDocumentNumberSearchTerm(search);

  if (!searchCondition || documentSearch === null) {
    return searchCondition;
  }

  return or(
    searchCondition,
    listSearchCondition(documentSearch, [person.documentNumber]),
  );
}

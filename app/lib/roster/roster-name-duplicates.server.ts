import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { filterUnacknowledgedMatches } from "@/lib/shared/duplicate-warning";
import type {
  RosterNameMatch,
  RosterNameScope,
  RosterNameWarning,
} from "@/lib/roster/roster-name-duplicates";

/**
 * A second row for the same person is a warning, not a refusal: two children
 * of one academy may share a name and a birth date. The check is case-folded
 * and whitespace-collapsed, and accent-sensitive — no folding extension is
 * installed (PRD #1090).
 */
export async function findDancerNameWarning(input: {
  academyId: string;
  acknowledgedDuplicateIds: readonly string[];
  birthDate: string;
  /** Absent while creating: there is no row to exclude yet. */
  dancerId?: string;
  firstName: string;
  lastName: string;
  scope: RosterNameScope;
}): Promise<RosterNameWarning | null> {
  const rows = await db.query.dancers.findMany({
    columns: { id: true, firstName: true, lastName: true },
    where: and(
      eq(dancers.academyId, input.academyId),
      input.dancerId ? ne(dancers.id, input.dancerId) : undefined,
      eq(dancers.birthDate, input.birthDate),
      normalizedNameEquals(dancers.firstName, input.firstName),
      normalizedNameEquals(dancers.lastName, input.lastName),
    ),
  });

  return toWarning({
    acknowledgedDuplicateIds: input.acknowledgedDuplicateIds,
    kind: "dancer-name",
    rows,
    scope: input.scope,
  });
}

export async function findProfessorNameWarning(input: {
  academyId: string;
  acknowledgedDuplicateIds: readonly string[];
  firstName: string;
  lastName: string;
  /** Absent while creating: there is no row to exclude yet. */
  professorId?: string;
  scope: RosterNameScope;
}): Promise<RosterNameWarning | null> {
  const rows = await db.query.professors.findMany({
    columns: { id: true, firstName: true, lastName: true },
    where: and(
      eq(professors.academyId, input.academyId),
      input.professorId ? ne(professors.id, input.professorId) : undefined,
      normalizedNameEquals(professors.firstName, input.firstName),
      normalizedNameEquals(professors.lastName, input.lastName),
    ),
  });

  return toWarning({
    acknowledgedDuplicateIds: input.acknowledgedDuplicateIds,
    kind: "professor-name",
    rows,
    scope: input.scope,
  });
}

function toWarning(input: {
  acknowledgedDuplicateIds: readonly string[];
  kind: RosterNameWarning["kind"];
  rows: { firstName: string; id: string; lastName: string }[];
  scope: RosterNameScope;
}): RosterNameWarning | null {
  const matches: RosterNameMatch[] = input.rows.map((row) => ({
    id: row.id,
    label: `${row.firstName} ${row.lastName}`,
  }));
  const unacknowledged = filterUnacknowledgedMatches(
    matches,
    input.acknowledgedDuplicateIds,
  );

  if (unacknowledged.length === 0) {
    return null;
  }

  return { kind: input.kind, matches: unacknowledged, scope: input.scope };
}

function normalizedNameEquals(column: PgColumn, value: string): SQL {
  return sql`lower(regexp_replace(btrim(${column}), '\s+', ' ', 'g')) = ${collapseWhitespace(value).toLowerCase()}`;
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

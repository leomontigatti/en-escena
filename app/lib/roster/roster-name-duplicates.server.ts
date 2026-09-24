import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { matchesToWarnAbout } from "@/lib/shared/duplicate-warning";
import { normalizedTextEquals } from "@/lib/shared/text-normalization.server";
import type { RosterScope } from "@/lib/roster/roster-scope";
import type {
  RosterNameMatch,
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
  scope: RosterScope;
}): Promise<RosterNameWarning | null> {
  const rows = await db.query.dancers.findMany({
    columns: { id: true, firstName: true, lastName: true },
    where: and(
      eq(dancers.academyId, input.academyId),
      input.dancerId ? ne(dancers.id, input.dancerId) : undefined,
      eq(dancers.birthDate, input.birthDate),
      normalizedTextEquals(dancers.firstName, input.firstName),
      normalizedTextEquals(dancers.lastName, input.lastName),
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
  scope: RosterScope;
}): Promise<RosterNameWarning | null> {
  const rows = await db.query.professors.findMany({
    columns: { id: true, firstName: true, lastName: true },
    where: and(
      eq(professors.academyId, input.academyId),
      input.professorId ? ne(professors.id, input.professorId) : undefined,
      normalizedTextEquals(professors.firstName, input.firstName),
      normalizedTextEquals(professors.lastName, input.lastName),
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
  scope: RosterScope;
}): RosterNameWarning | null {
  const matches: RosterNameMatch[] = input.rows.map((row) => ({
    id: row.id,
    label: `${row.firstName} ${row.lastName}`,
  }));
  const toWarnAbout = matchesToWarnAbout(
    matches,
    input.acknowledgedDuplicateIds,
  );

  if (toWarnAbout.length === 0) {
    return null;
  }

  return { kind: input.kind, matches: toWarnAbout, scope: input.scope };
}

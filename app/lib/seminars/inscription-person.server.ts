/**
 * Who a seminar inscription is for and which academy owns it. The inscription
 * stores no owner column: its person is a `dancer` or a `professor` —exactly
 * one, by the `seminar_inscription_exactly_one_person` CHECK— and its owner is
 * that person's `academy`. Every reader that needs the person's name and kind
 * or the owner academy reads it here, so a new kind of person is added in this
 * file and nowhere else.
 */

import { eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { QueryBuilder, type AnyPgColumn } from "drizzle-orm/pg-core";

import { dancers, professors, seminarInscriptions } from "@/db/schema";
import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";

const queryBuilder = new QueryBuilder();

/**
 * The person and the owner academy of every seminar inscription, one row per
 * inscription. Join it on `inscriptionId`:
 *
 * ```ts
 * .innerJoin(
 *   seminarInscriptionPerson,
 *   eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
 * )
 * ```
 *
 * Both roster tables are left-joined and whichever half is filled answers; the
 * CHECK is what makes the `coalesce` total.
 */
export const seminarInscriptionPerson = queryBuilder
  .select({
    inscriptionId: sql<string>`${seminarInscriptions.id}`.as("inscription_id"),
    kind: sql<RosterPersonKind>`case when ${seminarInscriptions.dancerId} is not null then 'dancer' else 'professor' end`.as(
      "person_kind",
    ),
    personId:
      sql<string>`coalesce(${seminarInscriptions.dancerId}, ${seminarInscriptions.professorId})`.as(
        "person_id",
      ),
    firstName:
      sql<string>`coalesce(${dancers.firstName}, ${professors.firstName})`.as(
        "first_name",
      ),
    lastName:
      sql<string>`coalesce(${dancers.lastName}, ${professors.lastName})`.as(
        "last_name",
      ),
    academyId:
      sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`.as(
        "academy_id",
      ),
  })
  .from(seminarInscriptions)
  .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
  .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
  .as("seminar_inscription_person");

/**
 * The seminar inscriptions owned by an academy, by any of several, or by the
 * academy a column of the outer query names: a condition on
 * `seminarInscriptions` that needs no join, so it also fits a lock, a count or
 * a delete. An empty list owns nothing.
 */
export function seminarInscriptionOwnedBy(
  academy: string | readonly string[] | AnyPgColumn,
): SQL {
  const ownedBy = (academyIdColumn: AnyPgColumn) =>
    Array.isArray(academy)
      ? inArray(academyIdColumn, academy)
      : eq(academyIdColumn, academy as string | AnyPgColumn);

  return or(
    inArray(
      seminarInscriptions.dancerId,
      queryBuilder
        .select({ id: dancers.id })
        .from(dancers)
        .where(ownedBy(dancers.academyId)),
    ),
    inArray(
      seminarInscriptions.professorId,
      queryBuilder
        .select({ id: professors.id })
        .from(professors)
        .where(ownedBy(professors.academyId)),
    ),
  ) as SQL;
}

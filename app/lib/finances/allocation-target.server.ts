/**
 * What an allocation points at. A payment's money sits on an inscription, and
 * from PRD #906 an inscription is of one of two kinds: a choreography
 * inscription (`choreography_dancer`) or a seminar inscription.
 *
 * The row carries the two as two nullable columns with a database `CHECK` that
 * exactly one is set, rather than as one column plus a kind, because only the
 * pair can carry a foreign key each: a single column would have to reference
 * both tables, which no foreign key can do. This module is what keeps the shape
 * of that pair in one place, so no caller ever writes the null half by hand.
 */

import { eq, sql, type SQL } from "drizzle-orm";

import { paymentAllocations } from "@/db/schema";

export type AllocationTargetKind = "choreography" | "seminar";

/** The inscription an allocation is against, named by kind and id. */
export type AllocationTarget = {
  id: string;
  kind: AllocationTargetKind;
};

/**
 * The two target columns as the row stores them: the kind's own column carries
 * the id and the other is null. This is the only place that decides which is
 * which on the write path.
 */
export function allocationTargetColumns(target: AllocationTarget): {
  choreographyInscriptionId: string | null;
  seminarInscriptionId: string | null;
} {
  return {
    choreographyInscriptionId:
      target.kind === "choreography" ? target.id : null,
    seminarInscriptionId: target.kind === "seminar" ? target.id : null,
  };
}

/** The shorthand for the kind most of the codebase still names implicitly. */
export function choreographyTarget(inscriptionId: string): AllocationTarget {
  return { id: inscriptionId, kind: "choreography" };
}

/**
 * The choreography target column typed as the non-null id it is **in a query
 * that already restricts it**: `inArray(choreographyInscriptionId, ids)` can
 * never match a null. It keeps the readers written before the column became
 * nullable reading one value instead of narrowing away a null their own `WHERE`
 * clause has already excluded. It is not for a query that does not restrict it —
 * `operational-summary.server` is the one such reader, and it checks.
 */
export const restrictedChoreographyInscriptionId = sql<string>`${paymentAllocations.choreographyInscriptionId}`;

/** The same choice on the read path: the predicate that matches the target. */
export function allocationTargetCondition(target: AllocationTarget): SQL {
  return target.kind === "choreography"
    ? eq(paymentAllocations.choreographyInscriptionId, target.id)
    : eq(paymentAllocations.seminarInscriptionId, target.id);
}

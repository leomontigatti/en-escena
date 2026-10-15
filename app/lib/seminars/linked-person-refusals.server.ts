import { and, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { seminarInscriptions } from "@/db/schema";
import { listRosterRowsLinkedIndividuals } from "@/lib/individuals/link.server";
import type { InscriptionPersonKind } from "@/lib/roster/roster-person-kind.shared";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { listLinkedRowsAcademySeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Why one person may not be registered from the second side. The copy is the
 * caller's (`registration-refusals.ts`), so a reason carries only what the copy
 * needs to name.
 */
export type LinkedPersonRefusal =
  /** The individual's link reaches a row an academy registered: the first
   * such academy by name. */
  | { reason: "registered-by-academy"; academyName: string }
  /** The row is reached by an individual that registered itself. */
  | { reason: "registered-as-individual" };

export type LinkedPersonRefusalReason = LinkedPersonRefusal["reason"];

/**
 * One person, one inscription per seminar, whichever side registered it
 * (ADR-0019). Both directions read through the link module, so nothing is
 * refused before administration confirms the link, and a row the link reaches
 * counts whatever its `Estado de alta`. Only inscriptions on the roster refuse:
 * a withdrawn one holds money, not a place. Duplicates made before the link
 * was confirmed are administration's to remove.
 *
 * It runs under the seminar's lock, which both sides' registration takes, so
 * two registrations of the same person from either side are serialised.
 */
export async function findLinkedPersonRefusal(
  tx: Transaction,
  input: {
    personId: string;
    personKind: InscriptionPersonKind;
    seminarId: string;
  },
): Promise<LinkedPersonRefusal | null> {
  if (input.personKind === "individual") {
    const [held] = await listLinkedRowsAcademySeminarInscriptions(
      { individualId: input.personId, seminarId: input.seminarId },
      tx,
    );

    return held
      ? { reason: "registered-by-academy", academyName: held.academyName }
      : null;
  }

  const links = await listRosterRowsLinkedIndividuals(
    [{ id: input.personId, kind: input.personKind }],
    tx,
  );

  if (links.length === 0) {
    return null;
  }

  const [held] = await tx
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        inArray(
          seminarInscriptions.individualId,
          links.map((link) => link.individualId),
        ),
        activeSeminarInscription(),
      ),
    )
    .limit(1);

  return held ? { reason: "registered-as-individual" } : null;
}
